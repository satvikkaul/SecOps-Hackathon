"""Needs a real Postgres: DATABASE_URL=postgresql://... uv run pytest"""
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


def test_api():
    with TestClient(app) as c:
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
