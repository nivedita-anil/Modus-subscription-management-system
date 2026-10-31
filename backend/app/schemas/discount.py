from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DiscountIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    discount_type: Literal["percentage", "fixed"] = "percentage"
    value: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    min_purchase: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    min_quantity: int = Field(default=1, ge=1, le=100000)
    start_date: date | None = None
    end_date: date | None = None
    usage_limit: int | None = Field(default=None, ge=1)
    is_active: bool = True

    @model_validator(mode="after")
    def check(self):
        if self.discount_type == "percentage" and self.value > 100:
            raise ValueError("A percentage discount can't be more than 100.")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("'End date' can't be before 'Start date'.")
        return self


class DiscountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    discount_type: str
    value: Decimal
    min_purchase: Decimal
    min_quantity: int
    start_date: date | None = None
    end_date: date | None = None
    usage_limit: int | None = None
    used_count: int
    is_active: bool
    created_at: datetime
