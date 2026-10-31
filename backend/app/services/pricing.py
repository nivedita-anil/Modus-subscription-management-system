"""Line pricing shared by quotation templates, and later subscriptions and invoices."""
from decimal import ROUND_HALF_UP, Decimal

_CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(x) -> Decimal:
    return Decimal(x).quantize(_CENT, rounding=ROUND_HALF_UP)


def price_line(quantity: int, unit_price, discount=None, tax=None) -> dict:
    """gross = qty * unit price; discount comes off the gross; tax is charged on what is left."""
    gross = money(Decimal(quantity) * Decimal(unit_price))
    discount_amount = ZERO
    if discount is not None:
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
    }
