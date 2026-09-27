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


# ---------- Supplier Invites (MVP step 1: no supplier-facing screen, PIN verification, or report yet) ----------

INVITE_BODY = {"supplierName": "Acme Supplier", "supplierEmail": "supplier@example.com", "deadlineDays": 5}


def _new_assessment_id(c) -> str:
    return c.post("/api/assessments", json=BODY).json()["id"]


def test_invite_creation_is_level_1_with_a_hashed_pin(c):
    from app.main import pool

    parent_id = _new_assessment_id(c)
    res = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": parent_id})
    assert res.status_code == 201, res.text
    body = res.json()
    assert set(body.keys()) == {"inviteId", "inviteUrl", "emailSent", "stubbed"}
    assert "?invite=" in body["inviteUrl"]
    # No BREVO_API_KEY in the test environment: send is stubbed, never silently claimed as sent.
    assert body["emailSent"] is False
    assert body["stubbed"] is True

    with pool.connection() as conn:
        row = conn.execute(
            "select level, pin_hash, status, parent_assessment_id from supplier_invites where id = %s", (body["inviteId"],)
        ).fetchone()
    assert row["level"] == 1
    assert row["status"] == "pending"
    assert str(row["parent_assessment_id"]) == parent_id
    assert len(row["pin_hash"]) == 64 and not row["pin_hash"].isdigit()  # sha256 hex, not a plain 6-digit PIN


def test_invite_rejects_an_unknown_parent(c):
    import uuid

    assert c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": str(uuid.uuid4())}).status_code == 400
    assert c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": "not-a-uuid"}).status_code == 422


def test_invite_level_climbs_one_hop_at_a_time_and_stops_at_the_max(c):
    from app.main import MAX_INVITE_LEVEL, pool

    assessment_id = _new_assessment_id(c)
    for expected_level in range(1, MAX_INVITE_LEVEL + 1):
        res = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": assessment_id})
        assert res.status_code == 201, res.text
        invite_id = res.json()["inviteId"]
        with pool.connection() as conn:
            level = conn.execute("select level from supplier_invites where id = %s", (invite_id,)).fetchone()["level"]
        assert level == expected_level
        # Simulate the not-yet-built supplier submission: a new assessment becomes this invite's
        # child, so the *next* invite computes its level from this one instead of starting at 1.
        assessment_id = _new_assessment_id(c)
        with pool.connection() as conn:
            conn.execute("update supplier_invites set child_assessment_id = %s, status = 'submitted' where id = %s", (assessment_id, invite_id))

    # assessment_id is now the child of a level-MAX_INVITE_LEVEL invite; one more hop is rejected.
    rejected = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": assessment_id})
    assert rejected.status_code == 400, rejected.text


def _new_invite(c, monkeypatch, parent_id: str) -> tuple[str, str]:
    """Creates an invite and returns (token, pin). The API never returns the PIN — it only ever
    goes out by email — so this captures it via a patched send hook instead of guessing it."""
    from app import main
    from app.email import EmailResult

    captured = {}

    def fake_send(name, email_addr, invite_url, pin):
        captured["pin"] = pin
        return EmailResult(sent=True, stubbed=False, detail="test")

    monkeypatch.setattr(main, "send_invite_email", fake_send)
    res = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": parent_id})
    assert res.status_code == 201, res.text
    token = res.json()["inviteUrl"].split("?invite=")[1]
    return token, captured["pin"]


# A supplier submitting through an invite isn't creating a share link, so it sends no password —
# the BE locks the row with one nobody holds instead (see test_a_supplier_row_is_not_openable...).
SUBMIT_BASE = {k: v for k, v in BODY.items() if k != "password"}


def _submit_body(pin: str, share_choice: str = "score", filled_by_buyer: bool = False) -> dict:
    return {**SUBMIT_BASE, "pin": pin, "shareChoice": share_choice, "filledByBuyer": filled_by_buyer}


def test_get_invite_hides_everything_without_the_correct_pin(c, monkeypatch):
    token, pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    wrong_pin = "000000" if pin != "000000" else "111111"

    for res in (c.get(f"/api/invites/{token}"), c.get(f"/api/invites/{token}", params={"pin": wrong_pin})):
        assert res.status_code == 200, res.text
        assert res.json() == {"expired": False, "completed": False, "verified": False}

    assert c.get("/api/invites/does-not-exist").status_code == 404


def test_get_invite_with_the_correct_pin_returns_full_info(c, monkeypatch):
    parent_id = _new_assessment_id(c)
    token, pin = _new_invite(c, monkeypatch, parent_id)

    res = c.get(f"/api/invites/{token}", params={"pin": pin})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["verified"] is True
    assert body["expired"] is False and body["completed"] is False
    assert body["level"] == 1
    assert body["status"] == "pending"
    assert "deadline" in body
    # BODY's company is the inviter's, since parent_id's assessment was created from BODY.
    assert body["inviterCompany"] == BODY["company"]


def test_get_invite_expired_is_computed_not_written_to_status(c, monkeypatch):
    from app.main import pool

    token, pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    with pool.connection() as conn:
        conn.execute("update supplier_invites set deadline = now() - interval '1 second' where token = %s", (token,))

    res = c.get(f"/api/invites/{token}", params={"pin": pin})
    assert res.json()["expired"] is True

    with pool.connection() as conn:
        stored_status = conn.execute("select status from supplier_invites where token = %s", (token,)).fetchone()["status"]
    assert stored_status == "pending"  # never mutated by a read


def test_submit_creates_the_assessment_and_marks_the_invite_submitted(c, monkeypatch):
    from app.main import pool

    parent_id = _new_assessment_id(c)
    token, pin = _new_invite(c, monkeypatch, parent_id)

    res = c.post(f"/api/invites/{token}/submit", json=_submit_body(pin, share_choice="both"))
    assert res.status_code == 201, res.text
    assessment_id = res.json()["assessmentId"]

    with pool.connection() as conn:
        assessment = conn.execute("select company from assessments where id = %s", (assessment_id,)).fetchone()
        invite = conn.execute(
            "select status, share_choice, child_assessment_id from supplier_invites where token = %s", (token,)
        ).fetchone()
    assert assessment["company"] == BODY["company"]
    assert invite["status"] == "submitted"
    assert invite["share_choice"] == "both"
    assert str(invite["child_assessment_id"]) == assessment_id


def test_submit_filled_by_buyer_sets_that_status(c, monkeypatch):
    token, pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    res = c.post(f"/api/invites/{token}/submit", json=_submit_body(pin, filled_by_buyer=True))
    assert res.status_code == 201, res.text

    from app.main import pool

    with pool.connection() as conn:
        status = conn.execute("select status from supplier_invites where token = %s", (token,)).fetchone()["status"]
    assert status == "filled_by_buyer"


def test_submit_rejects_wrong_pin_expired_and_double_submit(c, monkeypatch):
    from app.main import pool

    token, pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    wrong_pin = "000000" if pin != "000000" else "111111"
    assert c.post(f"/api/invites/{token}/submit", json=_submit_body(wrong_pin)).status_code == 401

    expired_token, expired_pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    with pool.connection() as conn:
        conn.execute("update supplier_invites set deadline = now() - interval '1 second' where token = %s", (expired_token,))
    assert c.post(f"/api/invites/{expired_token}/submit", json=_submit_body(expired_pin)).status_code == 410

    first = c.post(f"/api/invites/{token}/submit", json=_submit_body(pin))
    assert first.status_code == 201, first.text
    second = c.post(f"/api/invites/{token}/submit", json=_submit_body(pin))
    assert second.status_code == 409, second.text


def test_invite_returns_the_pin_only_when_the_email_did_not_send(c, monkeypatch):
    from app import main
    from app.email import EmailResult

    parent_id = _new_assessment_id(c)

    # Stubbed (no BREVO_API_KEY): the buyer gets the PIN back so they can relay it themselves.
    monkeypatch.setattr(main, "send_invite_email", lambda *a: EmailResult(sent=False, stubbed=True, detail="no key"))
    stubbed = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": parent_id}).json()
    assert stubbed["stubbed"] is True and stubbed["emailSent"] is False
    assert stubbed["pin"].isdigit() and len(stubbed["pin"]) == 6

    # A real send failing (not stubbed, still not sent) also hands the PIN back.
    monkeypatch.setattr(main, "send_invite_email", lambda *a: EmailResult(sent=False, stubbed=False, detail="brevo 500"))
    failed = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": parent_id}).json()
    assert failed["stubbed"] is False and "pin" in failed

    # Sent for real: the PIN lives only in the supplier's inbox, never in this response.
    monkeypatch.setattr(main, "send_invite_email", lambda *a: EmailResult(sent=True, stubbed=False, detail="<msg-1>"))
    sent = c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": parent_id}).json()
    assert sent["emailSent"] is True
    assert "pin" not in sent


# ---------- Supply-chain report: share_choice is enforced here and nowhere else ----------

CHAIN_RESULTS = {
    "sector": "Trucking or freight carrier",
    "posture": {"score": 3.2, "band": "High"},
    "scenarios": [{"id": "BEC", "name": "Fake payment request", "risk": 3.2, "band": "High"}],
    "topActions": [{"id": "A1", "title": "Turn on two-step login", "whatToDo": "x", "cost": "Free", "time": "Under 1 hour",
                    "effort": 1, "priority": 0.7, "pctReduction": 0.2, "timeframe": 30, "cccs": ["BC.5.1"]}],
    "cccs": [{"control": "BC.5", "name": "Access control", "status": "Not yet met"}],
    "coverage": {"answered": 26, "total": 26},
}
REPORT_FIELDS = {"sector", "scenarios", "topActions", "cccs", "coverage"}


def _submit_supplier(c, monkeypatch, parent_id: str, share_choice: str, results: dict | None = None) -> str:
    """Creates an invite under parent_id and submits it with the given share_choice. Returns the
    new (child) assessment id, so a caller can hang a deeper supplier off it."""
    token, pin = _new_invite(c, monkeypatch, parent_id)
    res = c.post(
        f"/api/invites/{token}/submit",
        json={**SUBMIT_BASE, "results": results or CHAIN_RESULTS, "pin": pin, "shareChoice": share_choice, "filledByBuyer": False},
    )
    assert res.status_code == 201, res.text
    return res.json()["assessmentId"]


def test_supply_chain_returns_only_what_each_supplier_chose_to_share(c, monkeypatch):
    buyer = _new_assessment_id(c)
    _submit_supplier(c, monkeypatch, buyer, "score")
    _submit_supplier(c, monkeypatch, buyer, "report")
    _submit_supplier(c, monkeypatch, buyer, "both")
    _new_invite(c, monkeypatch, buyer)  # left pending, never submitted

    chain = c.get(f"/api/assessments/{buyer}/supply-chain")
    assert chain.status_code == 200, chain.text
    by_choice = {s["shareChoice"]: s for s in chain.json()["suppliers"]}

    # 'score' means the posture and strictly nothing else.
    assert set(by_choice["score"]["shared"]) == {"posture"}

    # 'report' means the report content and, critically, NOT the score.
    assert "posture" not in by_choice["report"]["shared"]
    assert set(by_choice["report"]["shared"]) == REPORT_FIELDS

    # 'both' is the only one that carries the score alongside the report.
    assert set(by_choice["both"]["shared"]) == REPORT_FIELDS | {"posture"}

    # Nothing at all leaks from an invite that was never submitted.
    assert by_choice[None]["shared"] == {}
    assert by_choice[None]["status"] == "pending"


def test_supply_chain_headline_score_ignores_suppliers_who_did_not_share_it(c, monkeypatch):
    """The subtle leak: a 'report'-only supplier's posture must not reach the buyer even folded
    into the highest-risk number."""
    buyer = _new_assessment_id(c)
    _submit_supplier(c, monkeypatch, buyer, "report", {**CHAIN_RESULTS, "posture": {"score": 3.4, "band": "High"}})
    _submit_supplier(c, monkeypatch, buyer, "score", {**CHAIN_RESULTS, "posture": {"score": 0.4, "band": "Low"}})

    body = c.get(f"/api/assessments/{buyer}/supply-chain").json()
    # Low, from the only supplier who shared a score — not High from the one who didn't.
    assert body["highestRiskBand"] == "Low"
    assert body["invited"] == 2 and body["responded"] == 2 and body["respondedPct"] == 100


def test_supply_chain_walks_deeper_levels_and_computes_timed_out_without_writing_it(c, monkeypatch):
    from app.main import pool

    buyer = _new_assessment_id(c)
    tier1 = _submit_supplier(c, monkeypatch, buyer, "both")
    _submit_supplier(c, monkeypatch, tier1, "score")  # a supplier's own supplier

    # A pending invite whose deadline has passed reads as timed out, without the column changing.
    stale_token, _ = _new_invite(c, monkeypatch, buyer)
    with pool.connection() as conn:
        conn.execute("update supplier_invites set deadline = now() - interval '1 second' where token = %s", (stale_token,))

    body = c.get(f"/api/assessments/{buyer}/supply-chain").json()
    assert sorted(s["level"] for s in body["suppliers"]) == [1, 1, 2]
    assert any(s["status"] == "timed_out" for s in body["suppliers"])
    assert body["responded"] == 2 and body["invited"] == 3  # the timed-out one doesn't count as a response

    with pool.connection() as conn:
        stored = conn.execute("select status from supplier_invites where token = %s", (stale_token,)).fetchone()["status"]
    assert stored == "pending"


def test_a_supplier_row_is_not_openable_as_a_share_link(c, monkeypatch):
    """A supplier submits without a password (they aren't making a share link). The row still has a
    share_token, so it must not be left open — the buyer reads it through /supply-chain instead."""
    from app.main import pool

    token, pin = _new_invite(c, monkeypatch, _new_assessment_id(c))
    assessment_id = c.post(f"/api/invites/{token}/submit", json=_submit_body(pin)).json()["assessmentId"]

    with pool.connection() as conn:
        row = conn.execute("select share_token, password_hash from assessments where id = %s", (assessment_id,)).fetchone()
    assert row["password_hash"] and row["password_hash"].startswith("scrypt$")
    assert c.get(f"/api/share/{row['share_token']}").status_code == 401


def test_supply_chain_404s_for_an_unknown_assessment(c):
    import uuid

    assert c.get(f"/api/assessments/{uuid.uuid4()}/supply-chain").status_code == 404
    # A malformed id used to reach Postgres and blow up as a 500: a uuid column rejects the literal.
    for bad in ("not-a-uuid", "1234", "------------------------------------"):
        assert c.get(f"/api/assessments/{bad}/supply-chain").status_code == 422, bad
    assert c.post("/api/invites", json={**INVITE_BODY, "parentAssessmentId": "not-a-uuid"}).status_code == 422


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
