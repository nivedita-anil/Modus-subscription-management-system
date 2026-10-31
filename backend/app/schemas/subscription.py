from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Status = Literal["draft", "quotation", "confirmed", "active", "closed"]
PaymentTerms = Literal["immediate", "net_15", "net_30", "net_60"]


class LineIn(BaseModel):
    product_id: int
    variant_id: int | None = None
    quantity: int = Field(ge=1, le=100000)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    tax_id: int | None = None
    discount_id: int | None = None


class SubscriptionIn(BaseModel):
    customer_id: int
    plan_id: int
    template_id: int | None = None
    start_date: date
    expiry_date: date
    payment_terms: PaymentTerms = "net_15"
    notes: str | None = Field(default=None, max_length=2000)
    lines: list[LineIn] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.expiry_date < self.start_date:
            raise ValueError("Expiry date can't be before the start date.")
        return self


class PriceRequest(BaseModel):
    lines: list[LineIn] = Field(default=[], max_length=50)
    # when editing, so lines that use something archived since can still be priced
    subscription_id: int | None = None


class StatusChange(BaseModel):
    status: Status
