from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    product_type: Mapped[str] = mapped_column(String(30), default="software", index=True)
    sales_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProductVariant.id",
    )


class ProductVariant(Base):
    """One option of a product, e.g. attribute='Brand', value='Odoo', extra_price=560."""

    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "attribute", "value", name="uq_product_variant"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    attribute: Mapped[str] = mapped_column(String(60))
    value: Mapped[str] = mapped_column(String(100))
    extra_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    product: Mapped["Product"] = relationship(back_populates="variants")
