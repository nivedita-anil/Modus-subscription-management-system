"""Line pricing shared by quotation templates, subscriptions and (later) invoices,
so totals always agree.

For each line:  subtotal = quantity x unit price
                discount = taken off the subtotal (only if the discount qualifies, when a date is given)
                tax      = tax rate x (subtotal - discount)
                total    = subtotal - discount + tax
"""
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

_CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(x) -> Decimal:
    return Decimal(x).quantize(_CENT, rounding=ROUND_HALF_UP)


def discount_applies(discount, quantity: int, subtotal: Decimal, on: date) -> bool:
    """Does this discount's rules (active, dates, usage limit, minimums) let it apply on `on`?"""
    if discount is None or not discount.is_active:
        return False
    if discount.start_date and on < discount.start_date:
        return False
    if discount.end_date and on > discount.end_date:
        return False
    if discount.usage_limit is not None and discount.used_count >= discount.usage_limit:
        return False
    if quantity < (discount.min_quantity or 0):
        return False
    if subtotal < (discount.min_purchase or 0):
        return False
    return True


def price_line(quantity: int, unit_price, discount=None, tax=None, on: date | None = None) -> dict:
    """With `on` set, the discount only applies if its rules allow it on that date.
    Without it (quotation templates, which are checked when saved) it always applies."""
    gross = money(Decimal(quantity) * Decimal(unit_price))
    applied = discount is not None and (on is None or discount_applies(discount, quantity, gross, on))
    discount_amount = ZERO
    if applied:
        if discount.discount_type == "percentage":
            discount_amount = money(gross * Decimal(discount.value) / 100)
        else:
            discount_amount = min(money(discount.value), gross)
    net = gross - discount_amount
    tax_amount = money(net * Decimal(tax.rate) / 100) if tax is not None else ZERO
    return {
        "subtotal": gross,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total": net + tax_amount,
        "discount_applied": applied,
    }


def sum_lines(priced: list[dict]) -> dict:
    return {
        "subtotal": sum((p["subtotal"] for p in priced), ZERO),
        "discount_total": sum((p["discount_amount"] for p in priced), ZERO),
        "tax_total": sum((p["tax_amount"] for p in priced), ZERO),
        "total": sum((p["total"] for p in priced), ZERO),
    }
