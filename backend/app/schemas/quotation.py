from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class QuotationLineIn(BaseModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(default=1, ge=1, le=100000)
    # leave empty to use the product's sales price (plus the variant's extra price)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    tax_id: int | None = None
    discount_id: int | None = None


class QuotationTemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    plan_id: int
    validity_days: int = Field(default=30, ge=1, le=3650)
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool = True
    lines: list[QuotationLineIn] = Field(min_length=1, max_length=50)


class QuotationLineOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    variant_id: int | None = None
    variant_label: str | None = None
    quantity: int
    unit_price: Decimal
    tax_id: int | None = None
    tax_name: str | None = None
    tax_rate: Decimal | None = None
    discount_id: int | None = None
    discount_name: str | None = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total: Decimal


class QuotationTemplateOut(BaseModel):
    id: int
    name: str
    plan_id: int
    plan_name: str
    billing_period: str
    validity_days: int
    notes: str | None = None
    is_active: bool
    created_at: datetime
    lines: list[QuotationLineOut]
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
