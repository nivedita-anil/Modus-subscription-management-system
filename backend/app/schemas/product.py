from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ProductType = Literal["software", "add_on", "service", "other"]


class VariantIn(BaseModel):
    id: int | None = None  # present = update that variant, absent = create a new one
    attribute: str = Field(min_length=1, max_length=60)
    value: str = Field(min_length=1, max_length=100)
    extra_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    attribute: str
    value: str
    extra_price: Decimal


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    product_type: ProductType = "software"
    sales_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    cost_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    is_active: bool = True
    variants: list[VariantIn] = []

    @model_validator(mode="after")
    def no_duplicate_variants(self):
        seen = set()
        for v in self.variants:
            key = (v.attribute.strip().lower(), v.value.strip().lower())
            if key in seen:
                raise ValueError(f"Duplicate variant: {v.attribute} = {v.value}")
            seen.add(key)
        return self


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    product_type: str
    sales_price: Decimal
    cost_price: Decimal
    notes: str | None = None
    is_active: bool
    created_at: datetime
    variants: list[VariantOut] = []
