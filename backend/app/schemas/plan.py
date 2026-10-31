from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

BillingPeriod = Literal["daily", "weekly", "monthly", "yearly"]


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    billing_period: BillingPeriod = "monthly"
    min_quantity: int = Field(default=1, ge=1, le=100000)
    available_from: date | None = None
    available_to: date | None = None
    auto_close: bool = False
    can_close_early: bool = False
    can_pause: bool = False
    can_renew: bool = False
    is_active: bool = True

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.available_from and self.available_to and self.available_to < self.available_from:
            raise ValueError("'Available to' can't be before 'Available from'.")
        return self


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: Decimal
    billing_period: str
    min_quantity: int
    available_from: date | None = None
    available_to: date | None = None
    auto_close: bool
    can_close_early: bool
    can_pause: bool
    can_renew: bool
    is_active: bool
    created_at: datetime
