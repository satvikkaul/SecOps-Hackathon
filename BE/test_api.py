"""Needs a real Postgres: DATABASE_URL=postgresql://... uv run pytest"""
import pytest

from app.dns_check import normalize_domain, parse_dmarc_policy, provider_from_mx
BODY = {
    "company": "Test Carrier",
    "profile": {"sector": "carrier"},
    "answers": {"Q1": "no", "Q7": "partial"},
    "rankingMode": "effort",
    "results": {"posture": {"score": 2.1, "band": "Elevated"}},
}


def test_dns_parsing():
    assert normalize_domain(" https://www.Example.ca/path ") == "example.ca"
    assert normalize_domain("bob@example.ca") == "example.ca"
    assert parse_dmarc_policy("v=DMARC1; p=quarantine; rua=x") == "quarantine"
    assert provider_from_mx(["0 x.mail.protection.outlook.com."]) == "m365"


def test_personalize_preflight_allows_sentry_headers(c):
    origin = "https://secops-hackathon-production.up.railway.app"
    res = c.options(
        "/api/personalize",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,sentry-trace,baggage",
        },
    )
    assert res.status_code == 200, res.text
    assert res.headers["access-control-allow-origin"] == origin


def test_api(c):
    assert c.get("/api/health").json() == {"ok": True, "db": True}

    created = c.post("/api/assessments", json=BODY)
    assert created.status_code == 201, created.text
    token = created.json()["shareToken"]
    assert created.json()["shareUrl"].endswith(f"/?share={token}")

    res = c.get(f"/api/share/{token}")
    shared = res.json()
    assert shared["company"] == "Test Carrier" and shared["results"] == BODY["results"]
    assert "answers" not in shared
    assert shared["expiresAt"] == created.json()["expiresAt"]
    assert res.headers["x-robots-tag"] == "noindex, nofollow"

    assert c.get("/api/share/nope").status_code == 404
    assert c.post("/api/assessments", json={**BODY, "answers": {"Q1": "maybe"}}).status_code == 422
    assert c.post("/api/assessments", json={**BODY, "domain": "not a domain"}).status_code == 400
    assert c.post("/api/assessments", json={**BODY, "company": "x" * 70000}).status_code == 413

    demo = c.get("/api/share/demo-peel-valley").json()
    assert [a["id"] for a in demo["results"]["topActions"]] == ["A1", "A19", "A7", "A8", "A4"]
    assert demo["expiresAt"] is None
    # Pinned demo DNS never hits the network.
    assert c.get("/api/dns/peelvalleyfresh.ca").json()["cached"] is True
    assert c.get("/api/dns/peelvalleyfresh.ca").json()["cached"] is True


def test_share_link_expires(c):
    from datetime import datetime, timedelta, timezone

    from app.main import SHARE_TTL_DAYS, pool

    created = c.post("/api/assessments", json=BODY).json()
    expires = datetime.fromisoformat(created["expiresAt"])
    # Calendar days in the DB's time zone, so a daylight-saving change can shift it by an hour.
    assert abs(expires - datetime.now(timezone.utc) - timedelta(days=SHARE_TTL_DAYS)) <= timedelta(hours=1, minutes=5)

    with pool.connection() as conn:
        conn.execute("update assessments set expires_at = now() - interval '1 second' where share_token = %s", (created["shareToken"],))
    assert c.get(f"/api/share/{created['shareToken']}").status_code == 410


def test_share_creation_is_rate_limited(c, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "share_limit", main.RateLimit(per_ip_per_minute=1, total_per_hour=100))
    assert c.post("/api/assessments", json=BODY).status_code == 201
    assert c.post("/api/assessments", json=BODY).status_code == 429


# ---------- Signed-in saves (verify_user is stubbed: no real Supabase token needed) ----------

FAKE_USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
FAKE_USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _ensure_fake_user(user_id: str) -> None:
    """A row in auth.users for user_id to satisfy assessments.user_id's foreign key. Only the
    columns Supabase requires; real signups fill in the rest."""
    from app.main import pool

    with pool.connection() as conn:
        conn.execute("insert into auth.users (id, email) values (%s, %s) on conflict (id) do nothing", (user_id, f"{user_id}@test.example"))


def test_assessment_saved_anonymously_without_auth_header(c):
    from app.main import pool

    created = c.post("/api/assessments", json=BODY).json()
    with pool.connection() as conn:
        row = conn.execute("select user_id from assessments where share_token = %s", (created["shareToken"],)).fetchone()
    assert row["user_id"] is None


def test_authenticated_save_sets_user_id(c, monkeypatch):
    from app import main

    _ensure_fake_user(FAKE_USER_A)
    monkeypatch.setattr(main, "verify_user", lambda auth: FAKE_USER_A if auth == "Bearer token-a" else None)

    created = c.post("/api/assessments", json=BODY, headers={"Authorization": "Bearer token-a"}).json()
    with main.pool.connection() as conn:
        row = conn.execute("select user_id from assessments where share_token = %s", (created["shareToken"],)).fetchone()
    assert str(row["user_id"]) == FAKE_USER_A

    # A bad/expired token behaves exactly like no header: still saves, just anonymously.
    anon = c.post("/api/assessments", json=BODY, headers={"Authorization": "Bearer not-a-real-token"}).json()
    with main.pool.connection() as conn:
        row = conn.execute("select user_id from assessments where share_token = %s", (anon["shareToken"],)).fetchone()
    assert row["user_id"] is None


def test_mine_requires_auth_and_only_returns_the_caller_own_rows(c, monkeypatch):
    from app import main

    assert c.get("/api/assessments/mine").status_code == 401
    assert c.get("/api/assessments/mine", headers={"Authorization": "Bearer nope"}).status_code == 401

    _ensure_fake_user(FAKE_USER_A)
    _ensure_fake_user(FAKE_USER_B)
    monkeypatch.setattr(main, "verify_user", lambda auth: FAKE_USER_A if auth == "Bearer token-a" else (FAKE_USER_B if auth == "Bearer token-b" else None))

    import uuid

    a_company, b_company = f"User A Co {uuid.uuid4()}", f"User B Co {uuid.uuid4()}"
    c.post("/api/assessments", json={**BODY, "company": a_company}, headers={"Authorization": "Bearer token-a"})
    c.post("/api/assessments", json={**BODY, "company": b_company}, headers={"Authorization": "Bearer token-b"})

    mine_a = c.get("/api/assessments/mine", headers={"Authorization": "Bearer token-a"}).json()
    mine_b = c.get("/api/assessments/mine", headers={"Authorization": "Bearer token-b"}).json()

    # Each user sees their own new row and, importantly, never the other user's.
    assert any(a["company"] == a_company for a in mine_a)
    assert not any(a["company"] == b_company for a in mine_a)
    assert any(b["company"] == b_company for b in mine_b)
    assert not any(b["company"] == a_company for b in mine_b)
    assert all("shareUrl" in a and "createdAt" in a for a in mine_a)


def test_rate_limit_counts_per_ip_and_overall():
    from app.main import RateLimit

    per_ip = RateLimit(per_ip_per_minute=2, total_per_hour=100)
    assert [per_ip.allow("a") for _ in range(3)] == [True, True, False]
    assert per_ip.allow("b") is True

    overall = RateLimit(per_ip_per_minute=100, total_per_hour=2)
    assert [overall.allow(ip) for ip in "abc"] == [True, True, False]


# ---------- Gemini guardrails (no network: Gemini is stubbed) ----------
import copy
import uuid

from app import personalize as ai

REQ = {
    "level": "basic",
    "business": {"sector": "Trucking or freight carrier"},
    "gaps": ["One person can change where a load goes"],
    "strengths": [],
    "risks": [{"id": "CARGO", "name": "Load redirected to thieves", "band": "High", "chain": ["a", "b", "c"], "reasons": []}],
    "actions": [
        {"id": "A19", "title": "t", "whatToDo": "w", "why": "y", "cost": "Free", "time": "Under 1 hour", "timeframe": 30, "steps": ["s1", "s2", "s3"], "yourGaps": []}
    ],
}
OUT = {
    "profile": "You run a small carrier.",
    "risks": [{"id": "CARGO", "why": "Any dispatcher can reroute a load."}],
    "actions": [{"id": "A19", "title": "Get a second OK", "whatToDo": "Call back first.", "why": "Stops load theft.", "steps": ["1. Write the rule", "Call back", "Log it"]}],
}


def test_validate_accepts_and_strips_step_numbers():
    clean = ai.validate(REQ, OUT)
    assert clean["actions"][0]["steps"][0] == "Write the rule"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda o: o["actions"].append({**o["actions"][0], "id": "A1"}),  # added a fix
        lambda o: o["risks"].clear(),  # dropped a risk
        lambda o: o["actions"][0].update(why="Saves you $85,000 a year."),  # invented a figure
        lambda o: o["actions"][0].update(steps=["only one"]),  # too few steps
        lambda o: o.update(profile="See https://evil.example"),  # link
    ],
)
def test_validate_rejects(mutate):
    bad = copy.deepcopy(OUT)
    mutate(bad)
    with pytest.raises(ai.PersonalizeError):
        ai.validate(REQ, bad)


def test_personalize_route_caches_and_falls_back(c, monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "call_gemini", lambda req: calls.append(1) or copy.deepcopy(OUT))
    req = {**REQ, "gaps": [f"test-{uuid.uuid4()}"]}  # fresh cache key every run
    first = c.post("/api/personalize", json=req)
    second = c.post("/api/personalize", json=req)
    assert first.status_code == 200 and first.json()["cached"] is False
    assert second.json()["cached"] is True and len(calls) == 1

    monkeypatch.setattr(ai, "call_gemini", lambda req: {**OUT, "profile": "Costs you 99 dollars."})
    assert c.post("/api/personalize", json={**req, "level": "expert"}).status_code == 503
    assert c.post("/api/personalize", json={**req, "level": "nope"}).status_code == 422
