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

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field, StringConstraints

from app import personalize as ai
from app.dns_check import all_failed, check_domain, is_valid_domain, normalize_domain

HERE = Path(__file__).parent
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://secops-hackathon-production.up.railway.app").rstrip("/")
MAX_BODY = 64 * 1024
DNS_TTL = "24 hours"

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
                """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns)
                   values (%s, %s, %s, %s, %s, %s, %s, %s)
                   on conflict (share_token) do update set company = excluded.company, domain = excluded.domain,
                     profile = excluded.profile, answers = excluded.answers, ranking_mode = excluded.ranking_mode,
                     results = excluded.results, dns = excluded.dns""",
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
    seed()
    yield
    pool.close()


app = FastAPI(title="Chain of Custody API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
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
def create_assessment(body: AssessmentIn):
    domain = valid_domain_or_400(body.domain) if body.domain else None
    # Only our own lookup is stored: the "verified" part must not come from the client.
    dns = dns_for(domain) if domain else None
    token = secrets.token_urlsafe(16)
    with pool.connection() as conn:
        row = conn.execute(
            """insert into assessments (share_token, company, domain, profile, answers, ranking_mode, results, dns)
               values (%s, %s, %s, %s, %s, %s, %s, %s) returning id""",
            (token, body.company, domain, Jsonb(body.profile), Jsonb(body.answers), body.rankingMode, Jsonb(body.results), Jsonb(dns) if dns else None),
        ).fetchone()
    return {"id": str(row["id"]), "shareToken": token, "shareUrl": f"{FRONTEND_URL}/?share={token}"}


@app.get("/api/share/{token}")
def get_share(token: str):
    with pool.connection() as conn:
        row = conn.execute(
            "select company, domain, ranking_mode, results, dns, created_at from assessments where share_token = %s",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    # Raw answers are deliberately not returned: partners see the summary, not the questionnaire.
    return {
        "company": row["company"],
        "domain": row["domain"],
        "rankingMode": row["ranking_mode"],
        "results": row["results"],
        "dns": row["dns"],
        "createdAt": row["created_at"].isoformat(),
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


# Uncached calls spend the Gemini key, so cap them. Cache hits are free and unlimited.
# ponytail: in-memory, per process; fine for one Railway replica. Move to Postgres if we scale out.
_calls: dict[str, deque] = {}
_all_calls: deque = deque()
_lock = threading.Lock()
PER_IP_PER_MIN = 6
ALL_PER_HOUR = 300


def _allow(ip: str) -> bool:
    now = time.monotonic()
    with _lock:
        q = _calls.setdefault(ip, deque())
        while q and now - q[0] > 60:
            q.popleft()
        while _all_calls and now - _all_calls[0] > 3600:
            _all_calls.popleft()
        if len(q) >= PER_IP_PER_MIN or len(_all_calls) >= ALL_PER_HOUR:
            return False
        q.append(now)
        _all_calls.append(now)
        return True


@app.post("/api/personalize")
def post_personalize(body: PersonalizeIn, request: Request):
    req = body.model_dump()
    key = hashlib.sha256(f"{ai.PROMPT_VERSION}|{ai.MODEL}|{json.dumps(req, sort_keys=True)}".encode()).hexdigest()
    with pool.connection() as conn:
        row = conn.execute("select result from ai_texts where key = %s", (key,)).fetchone()
    if row:
        return {**row["result"], "cached": True}

    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0].strip()
    if not _allow(ip):
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
