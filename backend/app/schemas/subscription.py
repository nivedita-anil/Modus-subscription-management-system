from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.subscription import TERMS
from app.schemas.quotation import QuotationLineIn, QuotationLineOut

Terms = Literal[TERMS]  # type: ignore[valid-type]
Status = Literal["draft", "quotation", "confirmed", "active", "closed"]


class SubscriptionIn(BaseModel):
    customer_id: int
    plan_id: int
    template_id: int | None = None
    discount_id: int | None = None  # applies to the whole subscription
    start_date: date
    expiry_date: date | None = None
    payment_terms: Terms = "Net 15"
    notes: str | None = Field(default=None, max_length=2000)
    # leave empty together with a template_id to copy the template's lines
    lines: list[QuotationLineIn] = Field(default_factory=list, max_length=50)


class TransitionIn(BaseModel):
    to: Status


class ActionIn(BaseModel):
    action: Literal["pause", "resume", "close", "renew"]


class InvoiceBrief(BaseModel):
    id: int
    number: str | None
    status: str
    period_start: date
    period_end: date
    due_date: date
    total: Decimal
    amount_paid: Decimal


class SubscriptionRow(BaseModel):
    id: int
    number: str | None
    status: str
    is_paused: bool
    customer_id: int
    customer_name: str
    customer_company: str | None = None
    plan_id: int
    plan_name: str
    billing_period: str
    start_date: date
    expiry_date: date | None
    next_billing_date: date | None
    amount: Decimal


class SubscriptionPage(BaseModel):
    items: list[SubscriptionRow]
    total: int
    page: int
    page_size: int


class SubscriptionOut(BaseModel):
    id: int
    number: str | None
    status: str
    is_paused: bool
    customer_id: int
    customer_name: str
    customer_email: str
    customer_company: str | None = None
    plan_id: int
    plan_name: str
    billing_period: str
    plan_can_pause: bool
    plan_can_close_early: bool
    plan_can_renew: bool
    template_id: int | None
    discount_id: int | None
    discount_name: str | None
    start_date: date
    expiry_date: date | None
    payment_terms: str
    quotation_valid_until: date | None
    next_billing_date: date | None
    notes: str | None
    created_at: datetime
    lines: list[QuotationLineOut]
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal
    allowed_transitions: list[str]
    invoices: list[InvoiceBrief] = []
