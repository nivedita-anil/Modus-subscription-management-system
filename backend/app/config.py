from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Brightloop Subscription Management"

    # Database
    database_url: str = "sqlite+aiosqlite:///./brightloop.db"

    # Auth
    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 15

    # First admin account, created on startup if no admin exists.
    # Override both in .env (and change the password!) for anything beyond local dev.
    admin_email: str = "admin@brightloop.com"
    admin_password: str = "Admin@12345"

    # Frontend
    frontend_url: str = "http://localhost:5173"

    # Unified LLM API (OpenAI-compatible)
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "auto"

    # Email
    resend_api_key: str = ""
    email_from: str = "Brightloop <onboarding@resend.dev>"

    @field_validator("database_url")
    @classmethod
    def use_async_driver(cls, v: str) -> str:
        # Supabase/Render hand out plain postgres:// URLs; SQLAlchemy async needs asyncpg.
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql://", 1)
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v


settings = Settings()
