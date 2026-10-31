import re
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def password_problem(password: str) -> str | None:
    """Rules from the brief: more than 8 chars, upper, lower, special."""
    if len(password) <= 8:
        return "Password must be more than 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must contain an uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must contain a lowercase letter."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain a special character."
    return None


def _make_token(user_id: int, token_type: str, expires: timedelta, **extra) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        **extra,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: int, role: str) -> str:
    return _make_token(
        user_id, "access", timedelta(minutes=settings.access_token_expire_minutes), role=role
    )


def create_refresh_token(user_id: int) -> str:
    return _make_token(user_id, "refresh", timedelta(days=settings.refresh_token_expire_days))


def create_reset_token(user_id: int, hashed_password: str) -> str:
    # "pwd" ties the token to the current password, so it dies once the password changes.
    return _make_token(
        user_id,
        "reset",
        timedelta(minutes=settings.reset_token_expire_minutes),
        pwd=hashed_password[-12:],
    )


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as e:
        raise ValueError("Invalid or expired token") from e
    if payload.get("type") != expected_type:
        raise ValueError("Wrong token type")
    return payload
