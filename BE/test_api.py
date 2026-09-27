"""Needs a real Postgres: DATABASE_URL=postgresql://... uv run pytest"""
import pytest

from app.dns_check import normalize_domain, parse_dmarc_policy, provider_from_mx
BODY = {
    "company": "Test Carrier",
    "profile": {"sector": "carrier"},
    "answers": {"Q1": "no", "Q7": "partial"},
    "rankingMode": "effort",
    "results": {"posture": {"score": 2.1, "band": "Elevated"}},
    "password": "grocer-2026",
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

    locked = c.get(f"/api/share/{token}")
    assert locked.status_code == 401 and "Test Carrier" not in locked.text
    assert c.post(f"/api/share/{token}/unlock", json={"password": "wrong-guess"}).status_code == 401

    res = c.post(f"/api/share/{token}/unlock", json={"password": BODY["password"]})
    shared = res.json()
    assert shared["company"] == "Test Carrier" and shared["results"] == BODY["results"]
    assert "answers" not in shared and "password_hash" not in shared
    assert shared["expiresAt"] == created.json()["expiresAt"]
    assert res.headers["x-robots-tag"] == "noindex, nofollow"

    assert c.get("/api/share/nope").status_code == 404
    assert c.post("/api/share/nope/unlock", json={"password": "x"}).status_code == 404
    assert c.post("/api/assessments", json={k: v for k, v in BODY.items() if k != "password"}).status_code == 422
    assert c.post("/api/assessments", json={**BODY, "password": "short"}).status_code == 422
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


def test_passwords_are_stored_as_salted_scrypt_hashes(c):
    from app.main import hash_password, pool, verify_password

    first, second = hash_password("grocer-2026"), hash_password("grocer-2026")
    assert first.startswith("scrypt$") and first != second  # fresh salt each time
    assert verify_password("grocer-2026", first) and not verify_password("grocer-2027", first)
    assert not verify_password("anything", "garbage")

    token = c.post("/api/assessments", json=BODY).json()["shareToken"]
    with pool.connection() as conn:
        stored = conn.execute("select password_hash from assessments where share_token = %s", (token,)).fetchone()["password_hash"]
    assert BODY["password"] not in stored and verify_password(BODY["password"], stored)


def test_password_guesses_are_rate_limited_per_link(c, monkeypatch):
    from app import main

    token = c.post("/api/assessments", json=BODY).json()["shareToken"]
    monkeypatch.setattr(main, "unlock_token_limit", main.RateLimit(per_ip_per_minute=2, total_per_hour=100))
    assert [c.post(f"/api/share/{token}/unlock", json={"password": f"guess-{i}"}).status_code for i in range(3)] == [401, 401, 429]


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
