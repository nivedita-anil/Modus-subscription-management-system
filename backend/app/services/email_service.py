import httpx

from app.config import settings


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send via Resend. Without an API key, print the email to the server console instead."""
    if not settings.resend_api_key:
        print(f"\n===== EMAIL (Resend not configured) =====\nTo: {to}\nSubject: {subject}\n{html}\n=========================================\n")
        return False
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
        )
    return r.status_code < 300
# email send ,now password reset

async def send_password_reset(to: str, link: str) -> bool:
    html = (
        "<p>We received a request to reset your Brightloop password.</p>"
        f'<p><a href="{link}">Reset your password</a></p>'
        f"<p>This link expires in {settings.reset_token_expire_minutes} minutes. "
        "If you didn't ask for this, you can ignore this email.</p>"
        f"<p>Link: {link}</p>"
    )
    return await send_email(to, "Reset your Brightloop password", html)
