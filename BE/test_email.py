"""Pure unit tests for app.email — no DATABASE_URL, no network (httpx is mocked for the
configured-key path, and BREVO_API_KEY is unset for the stub path)."""

from app import email


def test_stubbed_when_no_api_key(monkeypatch):
    monkeypatch.setattr(email, "BREVO_API_KEY", "")
    result = email.send_invite_email("Acme Supplier", "supplier@example.com", "https://app.example/?invite=abc", "123456")
    assert result.stubbed is True
    assert result.sent is False
    assert "BREVO_API_KEY" in result.detail


def test_sends_via_brevo_with_the_correct_request_shape(monkeypatch):
    monkeypatch.setattr(email, "BREVO_API_KEY", "fake-key-for-test")
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"messageId": "<msg-1@brevo>"}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse()

    monkeypatch.setattr(email.httpx, "post", fake_post)

    result = email.send_invite_email("Acme Supplier", "supplier@example.com", "https://app.example/?invite=abc", "123456")

    assert result.sent is True
    assert result.stubbed is False
    assert result.detail == "<msg-1@brevo>"
    assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
    # Brevo authenticates with a plain api-key header, never Authorization: Bearer.
    assert captured["headers"]["api-key"] == "fake-key-for-test"
    assert "Authorization" not in captured["headers"]
    assert captured["json"]["sender"] == {"name": email.SENDER_NAME, "email": email.SENDER_EMAIL}
    assert captured["json"]["to"] == [{"email": "supplier@example.com", "name": "Acme Supplier"}]
    assert "123456" in captured["json"]["htmlContent"]
    assert "?invite=abc" in captured["json"]["htmlContent"]


def test_network_failure_does_not_raise(monkeypatch):
    import httpx

    monkeypatch.setattr(email, "BREVO_API_KEY", "fake-key-for-test")

    def fake_post(*a, **k):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(email.httpx, "post", fake_post)

    result = email.send_invite_email("Acme Supplier", "supplier@example.com", "https://app.example/?invite=abc", "123456")
    assert result.sent is False
    assert result.stubbed is False
