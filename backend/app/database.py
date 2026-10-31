from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    **({} if _is_sqlite else {"pool_size": 5, "max_overflow": 10}),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

#fastAPI
class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency: one session per request."""
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables on startup (fine for a hackathon; swap for Alembic later)."""
    import app.models  # noqa: F401  (registers all models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
