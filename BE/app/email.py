"""Supplier-invite emails via Brevo's (formerly Sendinblue) transactional email API.

This is a real, complete implementation of the "Send a transactional email" call
(api.brevo.com/v3/smtp/email) — not a placeholder. It only *behaves* like a stub when
BREVO_API_KEY isn't set yet, which is expected right now: the key is being set up separately.
"""

import os
from dataclasses import dataclass

import httpx

BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"
# Brevo rejects sends from a sender address/domain that isn't verified in the account, so this
# has to match whatever the account actually has verified — override it once that's set up.
SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "Chain of Custody")
SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "invites@chainofcustody.app")
TIMEOUT = 10.0


@dataclass
class EmailResult:
    sent: bool
    stubbed: bool
    detail: str


def _invite_html(supplier_name: str, invite_url: str, pin: str) -> str:
    return (
        f"<p>Hi {supplier_name},</p>"
        "<p>A supply-chain partner has asked you to complete a short cyber-risk check-up. "
        "It takes about 10 minutes and nothing is shared with them until you choose what to send.</p>"
        f'<p><a href="{invite_url}">{invite_url}</a></p>'
        f"<p>Your access PIN: <b>{pin}</b></p>"
    )


def send_invite_email(supplier_name: str, supplier_email: str, invite_url: str, pin: str) -> EmailResult:
    """Sends the supplier their invite link and PIN via Brevo. If BREVO_API_KEY isn't configured,
    logs what would have been sent and returns a clearly-labeled stubbed result — it never crashes
    and never pretends to have sent something it didn't."""
    if not BREVO_API_KEY:
        print(f"[stub] would send invite email to {supplier_email} ({supplier_name}): {invite_url}", flush=True)
        return EmailResult(sent=False, stubbed=True, detail="BREVO_API_KEY is not set")

    body = {
        "sender": {"name": SENDER_NAME, "email": SENDER_EMAIL},
        "to": [{"email": supplier_email, "name": supplier_name}],
        "subject": "You've been invited to a supply-chain security check-up",
        "htmlContent": _invite_html(supplier_name, invite_url, pin),
    }
    try:
        res = httpx.post(
            BREVO_SEND_URL,
            # Brevo authenticates with a plain api-key header, not an Authorization: Bearer token.
            headers={"api-key": BREVO_API_KEY, "content-type": "application/json", "accept": "application/json"},
            json=body,
            timeout=TIMEOUT,
        )
        res.raise_for_status()
        return EmailResult(sent=True, stubbed=False, detail=res.json().get("messageId", ""))
    except httpx.HTTPError as e:
        print(f"invite email failed: {e}", flush=True)
        return EmailResult(sent=False, stubbed=False, detail=str(e))
