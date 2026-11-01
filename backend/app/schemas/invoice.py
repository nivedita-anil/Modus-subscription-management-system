from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

Method = Literal["bank_transfer", "card", "upi", "cash", "cheque", "other"]


class GenerateIn(BaseModel):
    as_of: date | None = None  # defaults to today
    subscription_ids: list[int] | None = None


class GenerateOut(BaseModel):
    created: int
    skipped: int
    subscriptions: int
    closed: int
    errors: list[str]
    invoice_ids: list[int]


class BulkConfirmIn(BaseModel):
    ids: list[int] | None = None  # None = every draft invoice


class PaymentIn(BaseModel):
    invoice_id: int
    method: Method
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    paid_on: date | None = None
    note: str | None = Field(default=None, max_length=500)


class PaymentOut(BaseModel):
    id: int
    invoice_id: int
    invoice_number: str | None = None
    customer_name: str | None = None
    method: str
    amount: Decimal
    paid_on: date
    note: str | None = None
    created_at: datetime


class PaymentPage(BaseModel):
    items: list[PaymentOut]
    total: int
    page: int
    page_size: int
    amount_total: Decimal


class InvoiceLineOut(BaseModel):
    id: int
    description: str
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    discount_amount: Decimal
    tax_name: str | None
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal


class InvoiceRow(BaseModel):
    id: int
    number: str | None
    status: str
    is_overdue: bool
    days_overdue: int
    customer_id: int
    customer_name: str
    customer_company: str | None = None
    subscription_id: int
    subscription_number: str | None
    issue_date: date
    due_date: date
    period_start: date
    period_end: date
    total: Decimal
    amount_paid: Decimal
    balance: Decimal
    sent_at: datetime | None


class InvoicePage(BaseModel):
    items: list[InvoiceRow]
    total: int
    page: int
    page_size: int
    sum_total: Decimal
    sum_balance: Decimal


class InvoiceOut(InvoiceRow):
    customer_email: str
    discount_note: str | None
    payment_terms: str | None
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    lines: list[InvoiceLineOut]
    payments: list[PaymentOut]
