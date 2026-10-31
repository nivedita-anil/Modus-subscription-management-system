from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class TaxIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rate: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    description: str | None = Field(default=None, max_length=255)
    is_active: bool = True


class TaxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rate: Decimal
    description: str | None = None
    is_active: bool
    created_at: datetime
