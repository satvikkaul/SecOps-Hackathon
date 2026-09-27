import hashlib
import json
import os
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
    # Sentry browser tracing adds sentry-trace and baggage on calls to this host. A preflight that
    # asks for them is rejected with 400 ("Disallowed CORS headers") unless they are listed here.
    allow_headers=["content-type", "baggage", "sentry-trace"],
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
# Uncached calls spend the Gemini key, so cap them. Cache hits are free and unlimited.
personalize_limit = RateLimit(per_ip_per_minute=6, total_per_hour=300)


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


class AssessmentIn(BaseModel):
    company: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    domain: Annotated[str, StringConstraints(max_length=253)] | None = None
    profile: dict[Key, Annotated[str, StringConstraints(max_length=100)]] = Field(max_length=50)
    answers: dict[QuestionId, Literal["yes", "partial", "no", "unsure", "na"]] = Field(max_length=100)
    rankingMode: Literal["effort", "cost"]
    results: dict[str, Any]


@app.post("/api/assessments", status_code=201)
def create_assessment(body: AssessmentIn, request: Request):
    if not share_limit.allow(client_ip(request)):
        raise HTTPException(429, "Too many links, try again in a minute")
    domain = valid_domain_or_400(body.domain) if body.domain else None
    # Only our own lookup is stored: the "verified" part must not come from the client.
    dns = dns_for(domain) if domain else None
    token = secrets.token_urlsafe(16)
    # Optional: an Authorization header attaches this row to a signed-in user. No header, or a
    # header that doesn't check out, saves the same anonymous share it always has (user_id null).
    user_id = verify_user(request.headers.get("authorization"))
    with pool.connection() as conn:
        row = conn.execute(
            """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns, expires_at, user_id)
               values (%s, %s, %s, %s, %s, %s, %s, %s, now() + make_interval(days => %s), %s) returning id, expires_at""",
            (token, body.company, domain, Jsonb(body.profile), Jsonb(body.answers), body.rankingMode, Jsonb(body.results), Jsonb(dns) if dns else None, SHARE_TTL_DAYS, user_id),
        ).fetchone()
    return {
        "id": str(row["id"]),
        "shareToken": token,
        "shareUrl": f"{FRONTEND_URL}/?share={token}",
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


@app.get("/api/share/{token}")
def get_share(token: str, response: Response):
    # A share link is a bearer secret: keep it (and the company's summary) out of search results.
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    with pool.connection() as conn:
        row = conn.execute(
            """select company, domain, ranking_mode, results, dns, created_at, expires_at,
                      expires_at is not null and expires_at <= now() as expired
               from assessments where share_token = %s""",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if row["expired"]:
        raise HTTPException(410, "This link has expired")
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
