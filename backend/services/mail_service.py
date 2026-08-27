"""
Real email delivery via ZeptoMail's HTTP API - not SMTP, one HTTPS call.
Every function here is best-effort and returns whether a send actually
happened; nothing calling this may claim an email was sent unless this
module says so.
"""
import logging
import httpx
from core.config import settings

logger = logging.getLogger(__name__)

ZEPTOMAIL_URL = "https://api.zeptomail.in/v1.1/email"


async def send_email(to_address: str, to_name: str, subject: str, html_body: str) -> bool:
    if not settings.ZEPTOMAIL_TOKEN:
        logger.warning("ZEPTOMAIL_TOKEN not configured - email not sent: %s", subject)
        return False

    payload = {
        "from": {"address": settings.ZEPTOMAIL_FROM_ADDRESS, "name": settings.ZEPTOMAIL_FROM_NAME},
        "to": [{"email_address": {"address": to_address, "name": to_name}}],
        "subject": subject,
        "htmlbody": html_body,
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": settings.ZEPTOMAIL_TOKEN,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(ZEPTOMAIL_URL, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.error("ZeptoMail send failed (%s): %s", resp.status_code, resp.text[:500])
            return False
        return True
    except Exception:
        logger.exception("ZeptoMail send raised an exception")
        return False


async def send_verification_email(to_address: str, to_name: str, code: str) -> bool:
    subject = "Verify your Curatom Enterprise account"
    html_body = (
        f"<p>Hi {to_name},</p>"
        f"<p>Your Curatom Enterprise verification code is:</p>"
        f"<p style=\"font-size:24px;font-weight:bold;letter-spacing:2px;\">{code}</p>"
        f"<p>Enter this code in the app to verify your account. It expires in 30 minutes.</p>"
        f"<p>If you didn't request this, you can ignore this email.</p>"
    )
    return await send_email(to_address, to_name, subject, html_body)
