"""Needs a real Postgres: DATABASE_URL=postgresql://... uv run pytest"""
import pytest
from fastapi.testclient import TestClient

from app.dns_check import normalize_domain, parse_dmarc_policy, provider_from_mx
from app.main import app

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


@pytest.fixture(scope="module")
def c():
    # One app for the module: the DB pool opens once per process, as in production.
    with TestClient(app) as client:
        yield client


def test_api(c):
    assert c.get("/api/health").json() == {"ok": True, "db": True}

    created = c.post("/api/assessments", json=BODY)
    assert created.status_code == 201, created.text
    token = created.json()["shareToken"]
    assert created.json()["shareUrl"].endswith(f"/?share={token}")

    shared = c.get(f"/api/share/{token}").json()
    assert shared["company"] == "Test Carrier" and shared["results"] == BODY["results"]
    assert "answers" not in shared

    assert c.get("/api/share/nope").status_code == 404
    assert c.post("/api/assessments", json={**BODY, "answers": {"Q1": "maybe"}}).status_code == 422
    assert c.post("/api/assessments", json={**BODY, "domain": "not a domain"}).status_code == 400
    assert c.post("/api/assessments", json={**BODY, "company": "x" * 70000}).status_code == 413

    demo = c.get("/api/share/demo-peel-valley").json()
    assert [a["id"] for a in demo["results"]["topActions"]] == ["A1", "A19", "A7", "A8", "A4"]
    # Pinned demo DNS never hits the network.
    assert c.get("/api/dns/peelvalleyfresh.ca").json()["cached"] is True
    assert c.get("/api/dns/peelvalleyfresh.ca").json()["cached"] is True


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
