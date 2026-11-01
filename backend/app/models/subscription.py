from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.tax import TaxRule

# Draft -> Quotation -> Confirmed -> Active -> Closed
STATUSES = ("draft", "quotation", "confirmed", "active", "closed")
TERMS = ("Immediate", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    # "SUB-000123", filled in right after the row gets its id
    number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True, nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), index=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("quotation_templates.id"), nullable=True
    )
    # a discount that applies to the whole subscription (line discounts live on the lines)
    discount_id: Mapped[int | None] = mapped_column(ForeignKey("discounts.id"), nullable=True)

    status: Mapped[str] = mapped_column(String(12), default="draft", index=True)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_terms: Mapped[str] = mapped_column(String(20), default="Net 15")
    quotation_valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    # the start of the next period that still has to be invoiced; None = nothing left to bill
    next_billing_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    plan: Mapped[Plan] = relationship(lazy="selectin")
    discount: Mapped[Discount | None] = relationship(lazy="selectin")
    lines: Mapped[list["SubscriptionLine"]] = relationship(
        back_populates="subscription",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SubscriptionLine.id",
    )


class SubscriptionLine(Base):
    __tablename__ = "subscription_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tax_id: Mapped[int | None] = mapped_column(ForeignKey("tax_rules.id"), nullable=True)
    discount_id: Mapped[int | None] = mapped_column(ForeignKey("discounts.id"), nullable=True)

    subscription: Mapped[Subscription] = relationship(back_populates="lines")
    product: Mapped[Product] = relationship(lazy="selectin")
    variant: Mapped[ProductVariant | None] = relationship(lazy="selectin")
    tax: Mapped[TaxRule | None] = relationship(lazy="selectin")
    discount: Mapped[Discount | None] = relationship(lazy="selectin")
