from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.security import hash_password


async def seed_admin() -> None:
    """Make sure one admin exists (only an admin can add staff)."""
    async with SessionLocal() as db:
        existing = await db.scalar(select(User.id).where(User.role == UserRole.admin).limit(1))
        if existing:
            return
        db.add(
            User(
                email=settings.admin_email.lower(),
                full_name="Admin",
                hashed_password=hash_password(settings.admin_password),
                role=UserRole.admin,
            )
        )
        await db.commit()
        print(f"[seed] Created admin account: {settings.admin_email}")
