from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # daily | weekly | monthly | yearly
    billing_period: Mapped[str] = mapped_column(String(10), default="monthly", index=True)
    min_quantity: Mapped[int] = mapped_column(Integer, default=1)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    available_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Options the admin decides plan by plan
    auto_close: Mapped[bool] = mapped_column(Boolean, default=False)
    can_close_early: Mapped[bool] = mapped_column(Boolean, default=False)
    can_pause: Mapped[bool] = mapped_column(Boolean, default=False)
    can_renew: Mapped[bool] = mapped_column(Boolean, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
