"""Subscription lifecycle rules, shared by the staff screens and the customer portal."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import Discount
from app.models.invoice import Invoice
from app.models.product import Product, ProductVariant
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import TaxRule
from app.models.user import UserRole
from app.schemas.quotation import QuotationLineIn
from app.services.billing import next_period_start
from app.services.pricing import money

# where a subscription may go from each status
TRANSITIONS = {
    "draft": ["quotation", "closed"],
    "quotation": ["draft", "confirmed", "closed"],
    "confirmed": ["active", "closed"],
    "active": ["closed"],
    "closed": [],
}


def bad(message: str, code: int = 422) -> HTTPException:
    return HTTPException(code, message)


async def resolve_lines(
    db: AsyncSession, lines: list[QuotationLineIn], keep: dict | None = None
) -> list[SubscriptionLine]:
    """Validate request lines and turn them into rows. Archived items can't be newly picked,
    but a subscription that already uses one may keep it (`keep`)."""
    keep = keep or {"product": set(), "tax": set(), "discount": set()}
    rows = []
    for i, ln in enumerate(lines, start=1):
        where = f"Line {i}: "
        product = await db.get(Product, ln.product_id)
        if product is None:
            raise bad(where + "product not found.")
        if not product.is_active and product.id not in keep["product"]:
            raise bad(where + f"'{product.name}' is archived.")

        variant = None
        if ln.variant_id is not None:
            variant = await db.get(ProductVariant, ln.variant_id)
            if variant is None or variant.product_id != product.id:
                raise bad(where + "that variant doesn't belong to the chosen product.")

        unit_price = ln.unit_price
        if unit_price is None:
            unit_price = money(product.sales_price + (variant.extra_price if variant else 0))

        if ln.tax_id is not None:
            tax = await db.get(TaxRule, ln.tax_id)
            if tax is None:
                raise bad(where + "tax rule not found.")
            if not tax.is_active and tax.id not in keep["tax"]:
                raise bad(where + f"tax rule '{tax.name}' is archived.")

        if ln.discount_id is not None:
            d = await db.get(Discount, ln.discount_id)
            if d is None:
                raise bad(where + "discount not found.")
            if not d.is_active and d.id not in keep["discount"]:
                raise bad(where + f"discount '{d.name}' is archived.")

        rows.append(
            SubscriptionLine(
                product_id=product.id,
                variant_id=variant.id if variant else None,
                quantity=ln.quantity,
                unit_price=unit_price,
                tax_id=ln.tax_id,
                discount_id=ln.discount_id,
            )
        )
    return rows


def check_plan_rules(sub_plan, start: date, expiry: date | None, total_qty: int) -> None:
    if expiry is not None and expiry < start:
        raise bad("Expiry date can't be before the start date.")
    if sub_plan.available_from and start < sub_plan.available_from:
        raise bad(f"This plan isn't available before {sub_plan.available_from:%d %b %Y}.")
    if sub_plan.available_to and start > sub_plan.available_to:
        raise bad(f"This plan isn't available after {sub_plan.available_to:%d %b %Y}.")
    if total_qty < sub_plan.min_quantity:
        raise bad(f"This plan needs a total quantity of at least {sub_plan.min_quantity}.")


async def _last_period_end(db: AsyncSession, sub_id: int) -> date | None:
    return await db.scalar(
        select(func.max(Invoice.period_end)).where(
            Invoice.subscription_id == sub_id, Invoice.status != "cancelled"
        )
    )


async def transition(db: AsyncSession, sub: Subscription, to: str, today: date | None = None) -> None:
    today = today or date.today()
    if to not in TRANSITIONS.get(sub.status, []):
        raise bad(f"A {sub.status} subscription can't move to {to}.", 409)

    if to == "quotation":
        if not sub.lines:
            raise bad("Add at least one line before sending a quotation.")
        if sub.quotation_valid_until is None:
            sub.quotation_valid_until = today + timedelta(days=30)
    elif to == "confirmed":
        if sub.quotation_valid_until and today > sub.quotation_valid_until:
            raise bad(f"This quotation expired on {sub.quotation_valid_until:%d %b %Y}.", 409)
    elif to == "active":
        last = await _last_period_end(db, sub.id)
        sub.next_billing_date = (last + timedelta(days=1)) if last else sub.start_date
        if sub.expiry_date and sub.next_billing_date > sub.expiry_date:
            sub.next_billing_date = None
        sub.is_paused = False
    elif to == "closed":
        sub.closed_at = datetime.utcnow()
        sub.is_paused = False
        sub.next_billing_date = None
    sub.status = to
    await db.commit()


async def run_action(db: AsyncSession, sub: Subscription, action: str, role: UserRole) -> None:
    """pause / resume / close early / renew. Plans decide which are allowed; an admin may always."""
    plan, admin = sub.plan, role == UserRole.admin

    if action == "pause":
        if sub.status != "active" or sub.is_paused:
            raise bad("Only an active, running subscription can be paused.", 409)
        if not (plan.can_pause or admin):
            raise bad(f"The plan '{plan.name}' doesn't allow pausing.", 403)
        sub.is_paused = True

    elif action == "resume":
        if not sub.is_paused:
            raise bad("This subscription isn't paused.", 409)
        sub.is_paused = False

    elif action == "close":
        if sub.status != "active":
            raise bad("Only an active subscription can be closed early.", 409)
        if not (plan.can_close_early or admin):
            raise bad(f"The plan '{plan.name}' doesn't allow closing early.", 403)
        sub.status = "closed"
        sub.is_paused = False
        sub.next_billing_date = None
        sub.closed_at = datetime.utcnow()

    elif action == "renew":
        if sub.status not in ("active", "closed"):
            raise bad("Only an active or closed subscription can be renewed.", 409)
        if not (plan.can_renew or admin):
            raise bad(f"The plan '{plan.name}' doesn't allow renewing.", 403)
        if sub.expiry_date is None:
            raise bad("This subscription has no expiry date, so there is nothing to renew.", 409)
        # extend by the length of the original term (at least one billing period)
        term = max((sub.expiry_date - sub.start_date).days + 1, 1)
        min_end = next_period_start(sub.start_date, sub.expiry_date, plan.billing_period) - timedelta(days=1)
        new_expiry = max(sub.expiry_date + timedelta(days=term), min_end)
        last = await _last_period_end(db, sub.id)
        resume_from = (last + timedelta(days=1)) if last else sub.start_date
        sub.expiry_date = new_expiry
        sub.status = "active"
        sub.closed_at = None
        sub.next_billing_date = resume_from if resume_from <= new_expiry else None
    else:
        raise bad("Unknown action.")
    await db.commit()
