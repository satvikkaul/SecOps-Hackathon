import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field, StringConstraints

from app import catalog
from app import personalize as ai
from app.chat import handle_chat
from app.dns_check import all_failed, check_domain, is_valid_domain, normalize_domain
from app.email import send_invite_email

HERE = Path(__file__).parent
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://secops-hackathon-production.up.railway.app").rstrip("/")
MAX_BODY = 64 * 1024
DNS_TTL = "24 hours"
SHARE_TTL_DAYS = 90

# For verifying a signed-in user's token (see verify_user below). Same project as the FE's
# VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — safe to reuse, neither value is secret.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set (Supabase: Connect -> Session pooler URI)")

# prepare_threshold=None: Supabase's transaction pooler (port 6543) breaks prepared statements.
pool = ConnectionPool(
    DATABASE_URL,
    open=False,
    min_size=1,
    max_size=5,
    kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
)

DEMOS = {"demo-peel-valley": "demo_peel_valley.json"}
# Never a real PIN — demo invites are already submitted or left pending on purpose.
DEMO_PIN_HASH = hashlib.sha256(b"000000").hexdigest()


def seed() -> None:
    """Demo rows with fixed share tokens, so the live instance always has something to show."""
    with pool.connection() as conn:
        for token, file in DEMOS.items():
            d = json.loads((HERE / file).read_text())
            conn.execute(
                """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns, expires_at)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, null)
                   on conflict (share_token) do update set company = excluded.company, domain = excluded.domain,
                     profile = excluded.profile, answers = excluded.answers, ranking_mode = excluded.ranking_mode,
                     results = excluded.results, dns = excluded.dns, expires_at = null""",
                (token, d["company"], d["domain"], Jsonb(d["profile"]), Jsonb(d["answers"]), d["rankingMode"], Jsonb(d["results"]), Jsonb(d["dns"])),
            )
            conn.execute(
                """insert into dns_checks (domain, result, pinned) values (%s, %s, true)
                   on conflict (domain) do update set result = excluded.result, pinned = true, checked_at = now()""",
                (d["domain"], Jsonb(d["dns"])),
            )
        seed_demo_suppliers(conn)


def seed_demo_suppliers(conn) -> None:
    """Peel Valley's sample chain: a few responded suppliers, one waiting, one past due, and a
    second hop so the graph has depth. Tokens are fixed so a restart replaces the same rows."""
    demo = json.loads((HERE / "demo_peel_valley.json").read_text())
    suppliers = json.loads((HERE / "demo_suppliers.json").read_text())["suppliers"]
    keep_invites = [s["token"] for s in suppliers]
    keep_children = [s["childToken"] for s in suppliers if s.get("childToken")]
    conn.execute("delete from supplier_invites where token like 'demo-invite-%%' and not (token = any(%s))", (keep_invites,))
    conn.execute(
        "delete from assessments where share_token like 'demo-child-%%' and not (share_token = any(%s))",
        (keep_children,),
    )

    for s in suppliers:
        child_id = None
        if s.get("childToken") and s.get("results"):
            child = conn.execute(
                """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns, expires_at)
                   values (%s, %s, %s, %s, %s, %s, %s, null, null)
                   on conflict (share_token) do update set company = excluded.company, domain = excluded.domain,
                     results = excluded.results, expires_at = null
                   returning id""",
                (s["childToken"], s["name"], s.get("domain"), Jsonb(demo["profile"]), Jsonb(demo["answers"]), "effort", Jsonb(s["results"])),
            ).fetchone()
            child_id = child["id"]
        parent = conn.execute("select id from assessments where share_token = %s", (s["parentToken"],)).fetchone()
        if not parent:
            continue
        ancestor = conn.execute("select level from supplier_invites where child_assessment_id = %s", (parent["id"],)).fetchone()
        level = (ancestor["level"] + 1) if ancestor else 1
        conn.execute(
            """insert into supplier_invites (token, pin_hash, parent_assessment_id, supplier_name, supplier_email, level, status, share_choice, child_assessment_id, deadline)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now() + make_interval(days => %s))
               on conflict (token) do update set parent_assessment_id = excluded.parent_assessment_id,
                 supplier_name = excluded.supplier_name, supplier_email = excluded.supplier_email, level = excluded.level,
                 status = excluded.status, share_choice = excluded.share_choice, child_assessment_id = excluded.child_assessment_id,
                 deadline = excluded.deadline""",
            (s["token"], DEMO_PIN_HASH, parent["id"], s["name"], s["email"], level, s["status"], s.get("shareChoice"), child_id, s["deadlineDays"]),
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open(wait=True, timeout=15)
    with pool.connection() as conn:
        conn.execute((HERE.parent / "schema.sql").read_text())
        conn.execute((HERE.parent / "catalog.sql").read_text())
        catalog.seed(conn, catalog.read_files())
        catalog.current(conn)
    seed()
    yield
    pool.close()


app = FastAPI(title="Chain of Custody API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    # Vite picks the next free port when 5173 is taken, so allow any localhost port in dev rather
    # than just 5173 — this regex never matches a non-localhost origin, so prod is unaffected.
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["GET", "POST"],
    # A signed-in caller sends Authorization; Sentry tracing adds sentry-trace and baggage. A
    # preflight that asks for any of those is rejected with 400 ("Disallowed CORS headers") unless
    # they are listed here. That is what the live FE was hitting after account-save landed.
    allow_headers=["authorization", "content-type", "baggage", "sentry-trace"],
)


@app.middleware("http")
async def limit_body(request: Request, call_next):
    # ponytail: trusts Content-Length (browser fetch always sends it); stream-count the body if non-browser clients matter.
    if request.method == "POST":
        length = request.headers.get("content-length")
        if length is None or not length.isdigit():
            return JSONResponse({"detail": "Content-Length required"}, status_code=411)
        if int(length) > MAX_BODY:
            return JSONResponse({"detail": "Body too large"}, status_code=413)
    return await call_next(request)


def dns_for(domain: str) -> dict:
    """Fresh-enough or pinned cache row, else a live lookup. Falls back to a stale row if the lookup fails."""
    with pool.connection() as conn:
        row = conn.execute(
            f"select result, checked_at, pinned, checked_at > now() - interval '{DNS_TTL}' as fresh from dns_checks where domain = %s",
            (domain,),
        ).fetchone()
        if row and (row["pinned"] or row["fresh"]):
            return {**row["result"], "checkedAt": row["checked_at"].isoformat(), "cached": True}
        result = check_domain(domain)
        if all_failed(result):
            if row:
                return {**row["result"], "checkedAt": row["checked_at"].isoformat(), "cached": True}
            return {**result, "checkedAt": None, "cached": False}
        saved = conn.execute(
            """insert into dns_checks (domain, result) values (%s, %s)
               on conflict (domain) do update set result = excluded.result, checked_at = now()
               returning checked_at""",
            (domain, Jsonb(result)),
        ).fetchone()
        return {**result, "checkedAt": saved["checked_at"].isoformat(), "cached": False}


class RateLimit:
    """Sliding-window caps per client IP and across everyone.
    ponytail: in-memory, per process; fine for one Railway replica. Move to Postgres if we scale out."""

    def __init__(self, per_ip_per_minute: int, total_per_hour: int):
        self.per_ip_per_minute = per_ip_per_minute
        self.total_per_hour = total_per_hour
        self._by_ip: dict[str, deque] = {}
        self._all: deque = deque()
        self._lock = threading.Lock()

    def allow(self, ip: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if len(self._by_ip) > 10_000:
                self._by_ip = {k: q for k, q in self._by_ip.items() if q and now - q[-1] <= 60}
            q = self._by_ip.setdefault(ip, deque())
            while q and now - q[0] > 60:
                q.popleft()
            while self._all and now - self._all[0] > 3600:
                self._all.popleft()
            if len(q) >= self.per_ip_per_minute or len(self._all) >= self.total_per_hour:
                return False
            q.append(now)
            self._all.append(now)
            return True


def client_ip(request: Request) -> str:
    # Railway's proxy puts the real client first in X-Forwarded-For.
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()


def verify_user(authorization: str | None) -> str | None:
    """The Supabase user id for a valid 'Bearer <token>' Authorization header, or None if it's
    missing, malformed, or the token doesn't check out. Verifies through Supabase's own Auth API
    (GET /auth/v1/user) rather than decoding the JWT ourselves, so this works whichever signing
    algorithm the project uses (HS256 shared secret or the newer RS256/ES256 JWKS keys) and needs
    no signing secret on our side — only the same public URL/key the FE already uses."""
    if not authorization or not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        res = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_PUBLISHABLE_KEY},
            timeout=5.0,
        )
    except httpx.HTTPError:
        return None
    return res.json().get("id") if res.status_code == 200 else None


# Each new link is a DB row plus possibly a live DNS lookup, so cap how fast anyone can make them.
share_limit = RateLimit(per_ip_per_minute=10, total_per_hour=500)
# Password guesses: capped per client IP, and per link so spreading guesses over many IPs doesn't help.
unlock_ip_limit = RateLimit(per_ip_per_minute=10, total_per_hour=2000)
unlock_token_limit = RateLimit(per_ip_per_minute=10, total_per_hour=2000)

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
    except ValueError:
        return False
    return hmac.compare_digest(actual, base64.b64decode(digest))
# Uncached calls spend the Gemini key, so cap them. Cache hits are free and unlimited.
personalize_limit = RateLimit(per_ip_per_minute=6, total_per_hour=300)
# Each invite is a DB row plus an outbound email, so cap how fast anyone can send them.
invite_limit = RateLimit(per_ip_per_minute=5, total_per_hour=100)
# A 6-digit PIN is only ~1M combinations; cap attempts per IP so it can't be brute-forced.
invite_pin_limit = RateLimit(per_ip_per_minute=10, total_per_hour=200)


def valid_domain_or_400(value: str) -> str:
    domain = normalize_domain(value)
    if not is_valid_domain(domain):
        raise HTTPException(400, "Invalid domain")
    return domain


@app.get("/api/health")
def health():
    try:
        with pool.connection(timeout=3) as conn:
            conn.execute("select 1")
        return {"ok": True, "db": True}
    except Exception:
        return JSONResponse({"ok": False, "db": False}, status_code=503)


@app.get("/api/catalog")
def get_catalog(request: Request):
    """Everything the check-up shows and scores with. Revalidated on every load; unchanged content is a 304."""
    with pool.connection() as conn:
        snap = catalog.current(conn)
    etag = f'"{snap.version}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if etag in [t.strip() for t in request.headers.get("if-none-match", "").split(",")]:
        return Response(status_code=304, headers=headers)
    return Response(snap.json, media_type="application/json", headers=headers)


@app.get("/api/catalog/questions/{question_id}")
def get_catalog_question(question_id: str):
    with pool.connection() as conn:
        question = catalog.current(conn).questions.get(question_id)
    if question is None:
        raise HTTPException(404, "No such question")
    return question


@app.get("/api/catalog/actions/{action_id}")
def get_catalog_action(action_id: str):
    with pool.connection() as conn:
        action = catalog.current(conn).actions.get(action_id)
    if action is None:
        raise HTTPException(404, "No such fix")
    return action


@app.get("/api/dns/{domain}")
def get_dns(domain: str):
    return dns_for(valid_domain_or_400(domain))


Key = Annotated[str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,49}$")]
QuestionId = Annotated[str, StringConstraints(pattern=r"^Q\d{1,3}$")]
# Anything reaching a `where id = %s` on a uuid column: Postgres raises on a malformed literal,
# which would surface as a 500 rather than the 422 a bad request deserves.
UUID_RE = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
Uuid = Annotated[str, StringConstraints(pattern=UUID_RE)]


def assessment_ref(conn, ref: str) -> dict | None:
    """A saved row by uuid, or by share token (the demo company is looked up as demo-peel-valley).
    The uuid column is only queried when `ref` is shaped like one — otherwise Postgres raises."""
    row = conn.execute("select id, company, results from assessments where share_token = %s", (ref,)).fetchone()
    if row:
        return row
    if re.fullmatch(UUID_RE, ref):
        return conn.execute("select id, company, results from assessments where id = %s", (ref,)).fetchone()
    return None


class AssessmentPayload(BaseModel):
    company: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    domain: Annotated[str, StringConstraints(max_length=253)] | None = None
    profile: dict[Key, Annotated[str, StringConstraints(max_length=100)]] = Field(max_length=50)
    answers: dict[QuestionId, Literal["yes", "partial", "no", "unsure", "na"]] = Field(max_length=100)
    rankingMode: Literal["effort", "cost"]
    results: dict[str, Any]


class UnlockIn(BaseModel):
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class AssessmentIn(AssessmentPayload):
    # Set when the caller wants a link to hand to someone: whoever opens it must enter this, and
    # only a salted scrypt hash is stored. Omitted when no link is being handed out — an account
    # save, or the auto-save behind a supplier invite — and the row is then locked with a password
    # nobody holds, so /api/share/{token} is a dead end rather than an open door.
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)] | None = None


def create_assessment_row(conn, payload: AssessmentPayload, *, user_id: str | None = None, password: str | None = None) -> dict:
    """The one place an `assessments` row gets created — used by both POST /api/assessments and the
    supplier-invite submit endpoint. Normalizes/validates the domain, attaches the BE's own DNS
    result (never the client's), and generates a share token. Returns id, share_token, expires_at."""
    domain = valid_domain_or_400(payload.domain) if payload.domain else None
    dns = dns_for(domain) if domain else None
    token = secrets.token_urlsafe(16)
    # No password means nobody is meant to open this by link, so lock it with one nobody holds.
    # password_hash is never null on a row we write: /api/share then 401s for it, by construction.
    password = password or secrets.token_urlsafe(32)
    return conn.execute(
        """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns, password_hash, expires_at, user_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now() + make_interval(days => %s), %s) returning id, share_token, expires_at""",
        (token, payload.company, domain, Jsonb(payload.profile), Jsonb(payload.answers), payload.rankingMode, Jsonb(payload.results), Jsonb(dns) if dns else None,
         hash_password(password), SHARE_TTL_DAYS, user_id),
    ).fetchone()


@app.post("/api/assessments", status_code=201)
def create_assessment(body: AssessmentIn, request: Request):
    if not share_limit.allow(client_ip(request)):
        raise HTTPException(429, "Too many links, try again in a minute")
    # Optional: an Authorization header attaches this row to a signed-in user. No header, or a
    # header that doesn't check out, saves the same anonymous share it always has (user_id null).
    user_id = verify_user(request.headers.get("authorization"))
    with pool.connection() as conn:
        row = create_assessment_row(conn, body, user_id=user_id, password=body.password)
    return {
        "id": str(row["id"]),
        "shareToken": row["share_token"],
        "shareUrl": f"{FRONTEND_URL}/?share={row['share_token']}",
        "expiresAt": row["expires_at"].isoformat(),
    }


@app.get("/api/assessments/mine")
def get_my_assessments(request: Request):
    """The signed-in caller's own saved assessments. Requires a valid Authorization header — this
    is the one place a scoping bug would leak another user's data, so the query filters by the
    verified user_id and nothing else (never a client-supplied id)."""
    user_id = verify_user(request.headers.get("authorization"))
    if not user_id:
        raise HTTPException(401, "Sign in required")
    with pool.connection() as conn:
        rows = conn.execute(
            "select id, company, share_token, created_at from assessments where user_id = %s order by created_at desc",
            (user_id,),
        ).fetchall()
    return [
        {"id": str(r["id"]), "company": r["company"], "createdAt": r["created_at"].isoformat(), "shareUrl": f"{FRONTEND_URL}/?share={r['share_token']}"}
        for r in rows
    ]


def shared_row(token: str) -> dict:
    with pool.connection() as conn:
        row = conn.execute(
            """select company, domain, ranking_mode, results, dns, created_at, expires_at, password_hash,
                      expires_at is not null and expires_at <= now() as expired
               from assessments where share_token = %s""",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if row["expired"]:
        raise HTTPException(410, "This link has expired")
    return row


@app.get("/api/share/{token}")
def get_share(token: str, response: Response):
    # A share link is a bearer secret: keep it (and the company's summary) out of search results.
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    row = shared_row(token)
    if row["password_hash"]:
        # Says nothing about the company until the password is given.
        raise HTTPException(401, "Password required", headers={"X-Robots-Tag": "noindex, nofollow"})
    return shared_view(row)


@app.post("/api/share/{token}/unlock")
def unlock_share(token: str, body: UnlockIn, request: Request, response: Response):
    """The password travels in the body, never the URL, so it stays out of logs and browser history."""
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    if not unlock_ip_limit.allow(client_ip(request)) or not unlock_token_limit.allow(token):
        raise HTTPException(429, "Too many attempts, try again in a minute")
    row = shared_row(token)
    if row["password_hash"] and not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Wrong password")
    return shared_view(row)


def shared_view(row: dict) -> dict:
    # Raw answers are deliberately not returned: partners see the summary, not the questionnaire.
    return {
        "company": row["company"],
        "domain": row["domain"],
        "rankingMode": row["ranking_mode"],
        "results": row["results"],
        "dns": row["dns"],
        "createdAt": row["created_at"].isoformat(),
        "expiresAt": row["expires_at"].isoformat() if row["expires_at"] else None,
    }


# ---------- Supplier Invites (MVP, step 1: no supplier-facing screen yet) ----------

MAX_INVITE_LEVEL = 4
EmailAddress = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class InviteIn(BaseModel):
    # UUID of a saved row, or a demo share token such as demo-peel-valley.
    parentAssessmentId: Annotated[str, StringConstraints(min_length=8, max_length=80)]
    supplierName: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    supplierEmail: EmailAddress
    deadlineDays: Annotated[int, Field(ge=1, le=90)] = 7


@app.post("/api/invites", status_code=201)
def create_invite(body: InviteIn, request: Request):
    if not invite_limit.allow(client_ip(request)):
        raise HTTPException(429, "Too many invites, try again in a minute")
    with pool.connection() as conn:
        parent = assessment_ref(conn, body.parentAssessmentId)
        if not parent:
            raise HTTPException(400, "Unknown parentAssessmentId")
        # A hop down the chain: level = the invite that produced the parent assessment, +1. No such
        # invite means the parent is a top-level (self-initiated) assessment, so this is level 1.
        ancestor = conn.execute(
            "select level from supplier_invites where child_assessment_id = %s",
            (parent["id"],),
        ).fetchone()
        level = (ancestor["level"] + 1) if ancestor else 1
        if level > MAX_INVITE_LEVEL:
            raise HTTPException(400, f"This chain is already {MAX_INVITE_LEVEL} suppliers deep, which is as far as invites go")

        token = secrets.token_urlsafe(16)
        pin = f"{secrets.randbelow(1_000_000):06d}"
        pin_hash = hashlib.sha256(pin.encode()).hexdigest()
        row = conn.execute(
            """insert into supplier_invites (token, pin_hash, parent_assessment_id, supplier_name, supplier_email, level, deadline)
               values (%s, %s, %s, %s, %s, %s, now() + make_interval(days => %s)) returning id""",
            (token, pin_hash, parent["id"], body.supplierName, body.supplierEmail, level, body.deadlineDays),
        ).fetchone()

    invite_url = f"{FRONTEND_URL}/?invite={token}"
    email = send_invite_email(body.supplierName, body.supplierEmail, invite_url, pin)
    out = {
        "inviteId": str(row["id"]),
        "inviteUrl": invite_url,
        "emailSent": email.sent,
        "stubbed": email.stubbed,
    }
    # Deliberate: when we couldn't email the PIN, hand it back to the buyer who just created this
    # invite so they can relay it themselves. They're already authorized to know it. Never included
    # alongside a real send — then the supplier's email is the only place it appears.
    if not email.sent:
        out["pin"] = pin
    return out


def _invite_or_404(conn, token: str) -> dict:
    row = conn.execute(
        """select i.id, i.pin_hash, i.status, i.level, i.deadline, i.deadline <= now() as past_deadline,
                  a.company as inviter_company
           from supplier_invites i join assessments a on a.id = i.parent_assessment_id
           where i.token = %s""",
        (token,),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return row


@app.get("/api/invites/{token}")
def get_invite(token: str, request: Request, pin: str | None = None):
    with pool.connection() as conn:
        row = _invite_or_404(conn, token)

    completed = row["status"] in ("submitted", "filled_by_buyer")
    # A completed invite isn't "expired" even if its deadline has since passed — it did its job.
    expired = row["status"] == "pending" and bool(row["past_deadline"])
    verified = False
    if pin is not None:
        if not invite_pin_limit.allow(client_ip(request)):
            raise HTTPException(429, "Too many attempts, try again in a minute")
        verified = hashlib.sha256(pin.encode()).hexdigest() == row["pin_hash"]

    base = {"expired": expired, "completed": completed, "verified": verified}
    if not verified:
        # Pre-PIN (or wrong PIN): existence, expired, and completed only — nothing that names anyone.
        return base
    return {
        **base,
        "inviterCompany": row["inviter_company"],
        "level": row["level"],
        "deadline": row["deadline"].isoformat(),
        "status": row["status"],
    }


class InviteSubmitIn(AssessmentPayload):
    pin: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]
    shareChoice: Literal["score", "report", "both"]
    filledByBuyer: bool = False


@app.post("/api/invites/{token}/submit", status_code=201)
def submit_invite(token: str, body: InviteSubmitIn, request: Request):
    if not invite_pin_limit.allow(client_ip(request)):
        raise HTTPException(429, "Too many attempts, try again in a minute")
    with pool.connection() as conn:
        row = _invite_or_404(conn, token)
        if hashlib.sha256(body.pin.encode()).hexdigest() != row["pin_hash"]:
            raise HTTPException(401, "Incorrect PIN")
        if row["status"] == "pending" and row["past_deadline"]:
            raise HTTPException(410, "This invite has expired")
        if row["status"] in ("submitted", "filled_by_buyer"):
            raise HTTPException(409, "This invite has already been completed")

        # Not signed in: a supplier fills this in on their own link, not their (possibly nonexistent)
        # account. No password either — nobody asked for a shareable link here; the buyer reads this
        # through /supply-chain, filtered by share_choice.
        assessment = create_assessment_row(conn, body)
        status = "filled_by_buyer" if body.filledByBuyer else "submitted"
        conn.execute(
            "update supplier_invites set child_assessment_id = %s, status = %s, share_choice = %s where id = %s",
            (assessment["id"], status, body.shareChoice, row["id"]),
        )
    return {"assessmentId": str(assessment["id"])}


# Which `results` (Snapshot) fields each share_choice permits, in this codebase's own field names.
# An allow-list, never "take everything and delete some": a field added to Snapshot later stays
# hidden until someone deliberately lists it here.
SHARE_FIELDS: dict[str, tuple[str, ...]] = {
    "score": ("posture",),
    "report": ("sector", "scenarios", "topActions", "cccs", "coverage"),
    "both": ("posture", "sector", "scenarios", "topActions", "cccs", "coverage"),
}
BAND_ORDER = ("Low", "Moderate", "Elevated", "High")


@app.get("/api/assessments/{assessment_id}/supply-chain")
def get_supply_chain(assessment_id: str):
    """The buyer's view down their own supply chain: every invite descending from this assessment,
    carrying only what each supplier chose to share.

    `assessment_id` is either the row uuid or a share token (the demo uses demo-peel-valley). The
    uuid is an unguessable bearer secret, the same way a share token is. There's no owner check
    because an anonymous buyer has no user_id to check against."""
    with pool.connection() as conn:
        root = assessment_ref(conn, assessment_id)
        if not root:
            raise HTTPException(404, "Not found")
        rows = conn.execute(
            """with recursive chain as (
                   select i.id, i.level, i.status, i.deadline, i.supplier_name, i.share_choice,
                          i.child_assessment_id, i.parent_assessment_id, i.created_at, 1 as depth
                     from supplier_invites i
                    where i.parent_assessment_id = %s
                   union all
                   select i.id, i.level, i.status, i.deadline, i.supplier_name, i.share_choice,
                          i.child_assessment_id, i.parent_assessment_id, i.created_at, c.depth + 1
                     from supplier_invites i
                     join chain c on i.parent_assessment_id = c.child_assessment_id
                    where c.child_assessment_id is not null and c.depth < %s
               )
               select chain.id, chain.level, chain.status, chain.supplier_name, chain.share_choice,
                      chain.deadline <= now() as past_deadline, a.results, parent.id as parent_id
                 from chain
                 left join assessments a on a.id = chain.child_assessment_id
                 left join supplier_invites parent on parent.child_assessment_id = chain.parent_assessment_id
                order by chain.level, chain.created_at""",
            (root["id"], MAX_INVITE_LEVEL),
        ).fetchall()

    suppliers = []
    responded = 0
    worst = -1
    for r in rows:
        # Same compute-on-read rule as the expiry check: a passed deadline reads as timed out,
        # and nothing is written back to the status column.
        status = "timed_out" if r["status"] == "pending" and r["past_deadline"] else r["status"]
        if status in ("submitted", "filled_by_buyer"):
            responded += 1
        results = r["results"] or {}
        shared = {field: results[field] for field in SHARE_FIELDS.get(r["share_choice"] or "", ()) if field in results}
        # Only counts toward the headline number when the score is actually shared — a supplier who
        # chose 'report' must not have their posture reach the buyer, not even as an aggregate.
        band = shared.get("posture", {}).get("band")
        if band in BAND_ORDER:
            worst = max(worst, BAND_ORDER.index(band))
        suppliers.append(
            {
                "id": str(r["id"]),
                "parentId": str(r["parent_id"]) if r["parent_id"] else None,
                "level": r["level"],
                "status": status,
                "supplierName": r["supplier_name"],
                "shareChoice": r["share_choice"],
                "shared": shared,
            }
        )

    invited = len(rows)
    root_results = root["results"] or {}
    return {
        "company": root["company"],
        "posture": root_results.get("posture"),
        "invited": invited,
        "responded": responded,
        "respondedPct": round(responded / invited * 100) if invited else 0,
        "highestRiskBand": BAND_ORDER[worst] if worst >= 0 else None,
        "suppliers": suppliers,
    }


# ---------- Gemini personalization ----------

Short = Annotated[str, StringConstraints(max_length=200)]
Text = Annotated[str, StringConstraints(max_length=600)]


class RiskIn(BaseModel):
    id: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2,10}$")]
    name: Short
    band: Literal["High", "Elevated", "Moderate", "Low"]
    chain: list[Short] = Field(max_length=6)
    reasons: list[Short] = Field(max_length=8)


class ActionIn(BaseModel):
    id: Annotated[str, StringConstraints(pattern=r"^A\d{1,3}$")]
    title: Short
    whatToDo: Text
    why: Text
    cost: Short
    time: Short
    timeframe: Literal[30, 60, 90]
    steps: list[Text] = Field(min_length=1, max_length=8)
    yourGaps: list[Short] = Field(max_length=8)


class PersonalizeIn(BaseModel):
    level: Literal["basic", "medium", "expert"]
    business: dict[Short, Short] = Field(max_length=20)
    gaps: list[Short] = Field(max_length=30)
    strengths: list[Short] = Field(max_length=30)
    risks: list[RiskIn] = Field(min_length=1, max_length=5)
    actions: list[ActionIn] = Field(max_length=5)


@app.post("/api/personalize")
def post_personalize(body: PersonalizeIn, request: Request):
    req = body.model_dump()
    key = hashlib.sha256(f"{ai.PROMPT_VERSION}|{ai.MODEL}|{json.dumps(req, sort_keys=True)}".encode()).hexdigest()
    with pool.connection() as conn:
        row = conn.execute("select result from ai_texts where key = %s", (key,)).fetchone()
    if row:
        return {**row["result"], "cached": True}

    if not personalize_limit.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests, try again in a minute")
    try:
        result = ai.personalize(req)
    except ai.PersonalizeError as e:
        print(f"personalize failed: {e}", flush=True)
        raise HTTPException(503, "Personalization unavailable")
    with pool.connection() as conn:
        conn.execute(
            "insert into ai_texts (key, model, result) values (%s, %s, %s) on conflict (key) do nothing",
            (key, ai.MODEL, Jsonb(result)),
        )
    return {**result, "cached": False}


class ChatIn(BaseModel):
    sessionId: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    reportContext: dict[str, Any] = Field(default_factory=dict)


@app.post("/api/chat")
def chat(body: ChatIn):
    """Follow-up questions about the caller's own report. No DB: history lives in app.chat's in-memory
    session map for the life of this process, keyed by the client-generated sessionId."""
    return {"reply": handle_chat(body.sessionId, body.message, body.reportContext)}
