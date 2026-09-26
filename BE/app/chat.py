"""MVP follow-up chatbot for a user's own risk report. In-memory session history only
(no database) — fine for a hackathon demo, lost on restart or across Railway instances.

Gemini is primary; Claude is a fallback for when Gemini is unconfigured, rate-limited, or
down (the Gemini free tier is 5 requests/minute, easy to blow through mid-demo). Plain-text
turns are kept in _history so a mid-conversation fallback still has context, but the tool-call
steps themselves aren't replayed across turns/providers — each turn re-runs any tool call it needs."""

import json
import os
from pathlib import Path
from typing import Any

import anthropic
from google import genai
from google.genai import types

HERE = Path(__file__).parent
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

_ACTIONS: dict[str, dict] = {a["id"]: a for a in json.loads((HERE / "data" / "actions.json").read_text())}
_QUESTIONS: dict[str, dict] = {q["id"]: q for q in json.loads((HERE / "data" / "questions.json").read_text())["questions"]}

_gemini = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
_claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# sessionId -> genai chat object (Gemini's own history, used while Gemini is the one answering).
_gemini_sessions: dict[str, Any] = {}
# sessionId -> [{"role": "user"|"assistant", "content": str}], provider-agnostic, for the Claude fallback.
_history: dict[str, list[dict]] = {}

SYSTEM_INSTRUCTION = (
    "You are the assistant inside Chain of Custody, a free cyber-risk check-up for small food-supply-chain "
    "businesses (farms, processors, cold storage, carriers, brokers) — no signup required to use it. It asks "
    "about 25 plain-language yes/no/not-sure questions across a few categories (logins & accounts, payments & "
    "email, computers & backups, equipment & remote access, vendors & planning), takes about 10 minutes, then "
    "gives a ranked 'do these first' list of up to 5 fixes, each mapped to Canadian CCCS Baseline Controls and "
    "CIS Controls. There's a demo company to explore, and a read-only summary link a business can share with a "
    "partner. Signing in is optional and only used to save your results for later.\n\n"
    "This assistant is available on every screen, so every message starts with a JSON 'context' object telling "
    "you where the person is and what to ground your answer in:\n"
    "- context.report present (Results/Summary): they have a real report. Ground every answer in it and in the "
    "lookupAction/explainQuestion tools — call them instead of guessing at a fix's steps/cost or a question's "
    "reasoning. Never invent a CCCS control, a cost, or a step that isn't in the data.\n"
    "- context.currentQuestions present (the questionnaire): these are the questions currently on their screen "
    "(id, topic, text, why). Use them to explain what a question means or why it's asked; use the "
    "explainQuestion tool for any other question id they mention.\n"
    "- neither present (landing or earlier setup screens): there's no report yet — answer general questions "
    "about what Chain of Custody is and how it works from the facts above, and don't imply they have a score "
    "yet.\n\n"
    "Keep answers short (a few sentences) and in plain, non-technical language, the same tone as the product "
    "itself. If something isn't covered by the context, the tools, or the facts above, say so plainly instead "
    "of guessing."
)


def lookup_action(action_id: str) -> dict:
    """Look up the full detail for one recommended fix from the report, by its id (e.g. "A1"): title, what to
    do, why it matters, the step-by-step instructions, cost, time, and effort."""
    return _ACTIONS.get(action_id) or {"error": f"No action with id {action_id!r}"}


def explain_question(question_id: str) -> dict:
    """Look up the full text and reasoning for one check-up question, by its id (e.g. "Q1"): the question
    itself, why it's asked, and what a gap there means."""
    return _QUESTIONS.get(question_id) or {"error": f"No question with id {question_id!r}"}


def _prompt_for(message: str, report_context: dict) -> str:
    return f"Context (JSON):\n{json.dumps(report_context)}\n\nQuestion: {message}"


def _gemini_reply(session_id: str, message: str, report_context: dict) -> str:
    if session_id not in _gemini_sessions:
        _gemini_sessions[session_id] = _gemini.chats.create(
            model=GEMINI_MODEL,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION, tools=[lookup_action, explain_question]),
        )
    response = _gemini_sessions[session_id].send_message(_prompt_for(message, report_context))
    return response.text or "I couldn't come up with an answer to that — try asking it a different way?"


_CLAUDE_TOOLS: list[dict] = [
    {
        "name": "lookup_action",
        "description": lookup_action.__doc__,
        "input_schema": {"type": "object", "properties": {"action_id": {"type": "string"}}, "required": ["action_id"]},
    },
    {
        "name": "explain_question",
        "description": explain_question.__doc__,
        "input_schema": {"type": "object", "properties": {"question_id": {"type": "string"}}, "required": ["question_id"]},
    },
]
_CLAUDE_TOOL_FUNCS = {"lookup_action": lookup_action, "explain_question": explain_question}


def _claude_reply(session_id: str, message: str, report_context: dict) -> str:
    messages: list[dict] = [*_history.get(session_id, []), {"role": "user", "content": _prompt_for(message, report_context)}]
    # A handful of tool round-trips is plenty for two lookup-only tools; caps a runaway loop.
    for _ in range(4):
        response = _claude.messages.create(model=ANTHROPIC_MODEL, max_tokens=1024, system=SYSTEM_INSTRUCTION, tools=_CLAUDE_TOOLS, messages=messages)
        if response.stop_reason != "tool_use":
            return "".join(block.text for block in response.content if block.type == "text") or "I couldn't come up with an answer to that — try asking it a different way?"
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type == "tool_use":
                result = _CLAUDE_TOOL_FUNCS[block.name](*block.input.values())
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
        messages.append({"role": "user", "content": results})
    return "That took more digging than I could finish — try asking it a different way?"


def handle_chat(session_id: str, message: str, report_context: dict) -> str:
    """Try Gemini, then fall back to Claude if Gemini is unconfigured, rate-limited, or errors out.
    Never raises: if neither is configured or both fail, returns a plain-language reply instead."""
    reply = None
    if _gemini is not None:
        try:
            reply = _gemini_reply(session_id, message, report_context)
        except Exception:
            reply = None  # quota/network/etc: fall through to Claude
    if reply is None and _claude is not None:
        try:
            reply = _claude_reply(session_id, message, report_context)
        except Exception as e:
            reply = f"Sorry, I couldn't reach the assistant just now ({type(e).__name__}). Try again in a moment."
    if reply is None:
        reply = "The assistant isn't set up yet (missing GEMINI_API_KEY and ANTHROPIC_API_KEY on the server) — ask the team to add one."

    _history.setdefault(session_id, []).extend([{"role": "user", "content": message}, {"role": "assistant", "content": reply}])
    return reply
