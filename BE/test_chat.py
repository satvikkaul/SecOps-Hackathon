"""Pure unit tests for app.chat — no DATABASE_URL, no network. app.main needs a real Postgres
(see test_api.py), so these import app.chat directly instead of going through the FastAPI app."""

from app import chat


def test_lookup_action_known_and_unknown():
    a1 = chat.lookup_action("A1")
    assert a1["title"] == "Turn on two-step login for email"
    assert "steps" in a1

    assert "error" in chat.lookup_action("A999")


def test_explain_question_known_and_unknown():
    q1 = chat.explain_question("Q1")
    assert q1["topic"] == "Phone code on email"
    assert "why" in q1

    assert "error" in chat.explain_question("Q999")


def test_handle_chat_without_either_api_key_does_not_raise(monkeypatch):
    monkeypatch.setattr(chat, "_gemini", None)
    monkeypatch.setattr(chat, "_claude", None)
    reply = chat.handle_chat("s1", "What should I fix first?", {"posture": {"band": "High"}})
    assert "GEMINI_API_KEY" in reply and "ANTHROPIC_API_KEY" in reply


def test_falls_back_to_claude_when_gemini_errors(monkeypatch):
    def broken_gemini(*_args):
        raise RuntimeError("boom")

    monkeypatch.setattr(chat, "_gemini", object())  # present but broken, to force the except path
    monkeypatch.setattr(chat, "_claude", object())  # present, so the fallback is attempted
    monkeypatch.setattr(chat, "_gemini_reply", broken_gemini)
    monkeypatch.setattr(chat, "_claude_reply", lambda *a: "claude says hi")
    reply = chat.handle_chat("s2", "hello", {})
    assert reply == "claude says hi"
