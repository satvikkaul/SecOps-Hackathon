"""MVP follow-up chatbot for a user's own risk report. In-memory session history only
(no database) — fine for a hackathon demo, lost on restart or across Railway instances.

Gemini is primary; Claude is a fallback for when Gemini is unconfigured, rate-limited, or
down (the Gemini free tier is 5 requests/minute, easy to blow through mid-demo). Plain-text
turns are kept in _history so a mid-conversation fallback still has context, but the tool-call
steps themselves aren't replayed across turns/providers — each turn re-runs any tool call it needs."""

import json
import os
from typing import Any

import anthropic
from google import genai
from google.genai import types

from app import catalog

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash-lite")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

_gemini = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
_claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# sessionId -> genai chat object (Gemini's own history, used while Gemini is the one answering).
_gemini_sessions: dict[str, Any] = {}
# sessionId -> [{"role": "user"|"assistant", "content": str}], provider-agnostic, for the Claude fallback.
_history: dict[str, list[dict]] = {}

SYSTEM_INSTRUCTION = (
    "You are the assistant inside Chain of Custody, a free cyber-risk check-up for small food-supply-chain "
    "businesses (farms, processors, cold storage, carriers, brokers) — no signup required to use it. It asks "
    "about 26 plain-language yes/no/not-sure questions across a few categories (logins & accounts, payments & "
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
    "explainQuestion tool for any other question id they mention. Talk about them by topic, never by id.\n"
    "- neither present (landing or earlier setup screens): there's no report yet — answer general questions "
    "about what Chain of Custody is and how it works from the facts above, and don't imply they have a score "
    "yet.\n\n"
    "context.controls, when present, is the person's actual answer ('yes'/'partial'/'no'/'unsure'/'na'/'not "
    "answered') to a handful of specific controls: Q1 (MFA on email), Q7 (calling a supplier back on a known "
    "number before acting on a bank-detail change), Q8 (a second person approving large payments), Q9 (fake-email "
    "awareness training), Q18 (vendor remote access to equipment turned off when idle), Q26 (a call-back plus a "
    "second person's OK before changing a pickup or delivery address). These back the 'Try an example' scenarios "
    "on Results — fake vendor/IT emails asking to redirect a payment, click a login link, get remote access to "
    "equipment, or change a shipment's destination (including ones the person triggers with the example buttons, "
    "not just ones they paste in themselves). Whenever the person pastes or describes a suspicious message like "
    "that, first say plainly what's suspicious about it (urgency plus the specific ask — a payment, a login, "
    "remote access, a shipment change), then check the actual answer(s) in context.controls that apply instead "
    "of assuming: if the relevant one is anything but 'yes', name that specific gap and call lookupAction() for "
    "the matching fix (A1 for Q1, A7 for Q7/Q8, A8 for Q9, A13 for Q18, A19 for Q26); if it's 'yes', say so and "
    "explain why that would likely have caught this one; if it's 'na', say that control doesn't apply to their "
    "business and focus on whichever other relevant answer does. Never guess their answer if context.controls "
    "isn't present, or if none of its controls are relevant to what they described.\n\n"
    "Write like a person sitting next to them, in plain, non-technical language, the same tone as the product. "
    "No headings. The only markup allowed is the two shapes below — the chat renders them as cards and steps.\n"
    "- When they ask what the questions on screen mean, start with one sentence on what that section is really "
    "about. Then one bullet per question, using the topic from the context (write \"Vendor list\", never \"Q22\"):\n"
    "  - **Topic** — one sentence on what you're asking, and why a gap there matters to a small business.\n"
    "  End with one line inviting them to pick a single topic to unpack.\n"
    "- When you give the steps for a fix, use a numbered list in the same order as the tool result, one action per line: "
    "1. Do this.\n"
    "- Otherwise, a few plain sentences. Bold a term only when it is the name of the thing you are explaining.\n"
    "If something isn't covered by the context, the tools, or the facts above, say so plainly instead of guessing."
)


def lookup_action(action_id: str) -> dict:
    """Look up the full detail for one recommended fix from the report, by its id (e.g. "A1"): title, what to
    do, why it matters, the step-by-step instructions, cost, time, and effort."""
    return catalog.cached().actions.get(action_id) or {"error": f"No action with id {action_id!r}"}


def explain_question(question_id: str) -> dict:
    """Look up the full text and reasoning for one check-up question, by its id (e.g. "Q1"): the question
    itself, why it's asked, and what a gap there means."""
    return catalog.cached().questions.get(question_id) or {"error": f"No question with id {question_id!r}"}


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
    # Claude can write reasoning text in the same turn it calls a tool (e.g. "here's what's
    # suspicious... let me check your real answer" before calling lookup_action) — collect text
    # from every round, not just the last, or that earlier reasoning is silently dropped.
    text_parts: list[str] = []
    # A handful of tool round-trips is plenty for two lookup-only tools; caps a runaway loop.
    for _ in range(4):
        response = _claude.messages.create(model=ANTHROPIC_MODEL, max_tokens=1024, system=SYSTEM_INSTRUCTION, tools=_CLAUDE_TOOLS, messages=messages)
        text_parts.extend(block.text for block in response.content if block.type == "text")
        if response.stop_reason != "tool_use":
            return "\n\n".join(text_parts) or "I couldn't come up with an answer to that — try asking it a different way?"
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type == "tool_use":
                result = _CLAUDE_TOOL_FUNCS[block.name](*block.input.values())
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
        messages.append({"role": "user", "content": results})
    return "\n\n".join(text_parts) or "That took more digging than I could finish — try asking it a different way?"


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
