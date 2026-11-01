"""Billing engine: period maths, discount rules, and invoice generation.

One rule drives everything: an invoice is created for (subscription, period start), and the
database refuses a second live invoice for the same pair. So a double click, a second server
or a retry can never bill the same period twice, and catch-up runs never skip one.
"""
from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discount import Discount
from app.models.invoice import Invoice, InvoiceLine
from app.models.subscription import Subscription
from app.services.pricing import ZERO, money, price_line

CHUNK = 100


# --------------------------------------------------------------------------- periods
def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def next_period_start(start: date, current: date, period: str) -> date:
    """Start of the period after the one beginning on `current`.
    Monthly and yearly steps are counted from the original start date, so a subscription
    that began on the 31st doesn't drift to the 28th for good after February."""
    if period == "daily":
        return current + timedelta(days=1)
    if period == "weekly":
        return current + timedelta(days=7)
    step = 12 if period == "yearly" else 1
    k = ((current.year - start.year) * 12 + current.month - start.month) // step
    nxt = add_months(start, (k + 1) * step)
    while nxt <= current:
        k += 1
        nxt = add_months(start, (k + 1) * step)
    return nxt


def terms_days(terms: str | None) -> int:
    m = re.search(r"\d+", terms or "")
    return int(m.group()) if m else 0


# --------------------------------------------------------------------------- discounts
def _in_window(d: Discount, on: date) -> bool:
    return (d.start_date is None or d.start_date <= on) and (d.end_date is None or on <= d.end_date)


def usage_open(d: Discount) -> bool:
    return d.usage_limit is None or d.used_count < d.usage_limit


def eligible(d: Discount, on: date, qty: int, gross: Decimal) -> bool:
    """Everything except the usage limit (that one is claimed atomically at billing time)."""
    return bool(d.is_active and _in_window(d, on) and qty >= d.min_quantity and gross >= d.min_purchase)


def candidate_discounts(lines, sub_discount: Discount | None, on: date) -> dict[int, Discount]:
    found: dict[int, Discount] = {}
    total_qty, total_gross = 0, ZERO
    for ln in lines:
        gross = money(Decimal(ln.quantity) * Decimal(ln.unit_price))
        total_qty += ln.quantity
        total_gross += gross
        if ln.discount is not None and eligible(ln.discount, on, ln.quantity, gross):
            found[ln.discount.id] = ln.discount
    if sub_discount is not None and eligible(sub_discount, on, total_qty, total_gross):
        found[sub_discount.id] = sub_discount
    return found


# --------------------------------------------------------------------------- amounts
def compute(lines, sub_discount: Discount | None, allowed: set[int]) -> dict:
    """Price every line. Line discounts come off first, then the whole-subscription discount
    (spread over the lines in proportion to what is left), then tax on what remains."""
    rows = []
    for ln in lines:
        disc = ln.discount if ln.discount is not None and ln.discount.id in allowed else None
        p = price_line(ln.quantity, ln.unit_price, disc, None)
        rows.append({"line": ln, "subtotal": p["subtotal"], "line_discount": p["discount_amount"]})

    nets = [r["subtotal"] - r["line_discount"] for r in rows]
    total_net = sum(nets, ZERO)

    sub_amount = ZERO
    if sub_discount is not None and sub_discount.id in allowed and total_net > 0:
        if sub_discount.discount_type == "percentage":
            sub_amount = money(total_net * Decimal(sub_discount.value) / 100)
        else:
            sub_amount = min(money(sub_discount.value), total_net)

    remaining = sub_amount
    for i, r in enumerate(rows):
        share = ZERO
        if sub_amount > 0:
            share = remaining if i == len(rows) - 1 else money(sub_amount * nets[i] / total_net)
            share = min(share, nets[i], remaining)
            remaining -= share
        taxable = nets[i] - share
        tax = r["line"].tax
        tax_amount = money(taxable * Decimal(tax.rate) / 100) if tax is not None else ZERO
        r["discount_amount"] = r["line_discount"] + share
        r["tax_amount"] = tax_amount
        r["total"] = taxable + tax_amount

    return {
        "rows": rows,
        "subtotal": sum((r["subtotal"] for r in rows), ZERO),
        "discount_total": sum((r["discount_amount"] for r in rows), ZERO),
        "tax_total": sum((r["tax_amount"] for r in rows), ZERO),
        "total": sum((r["total"] for r in rows), ZERO),
    }


def preview(sub: Subscription, on: date | None = None) -> dict:
    """What the next invoice would look like today (no usage is consumed)."""
    on = on or date.today()
    cands = candidate_discounts(sub.lines, sub.discount, on)
    allowed = {i for i, d in cands.items() if usage_open(d)}
    return compute(sub.lines, sub.discount, allowed)


def line_description(ln) -> str:
    label = ln.product.name
    if ln.variant is not None:
        label += f" ({ln.variant.attribute}: {ln.variant.value})"
    return label[:300]


# --------------------------------------------------------------------------- generation
async def _claim(db: AsyncSession, discount_ids) -> set[int]:
    """Use up one use of each discount, atomically. A discount that just ran out is skipped."""
    claimed: set[int] = set()
    for did in discount_ids:
        res = await db.execute(
            update(Discount)
            .where(
                Discount.id == did,
                Discount.is_active.is_(True),
                or_(Discount.usage_limit.is_(None), Discount.used_count < Discount.usage_limit),
            )
            .values(used_count=Discount.used_count + 1)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount == 1:
            claimed.add(did)
    return claimed


async def _process_chunk(db: AsyncSession, ids: list[int], as_of: date, max_periods: int) -> dict:
    out = {"created": 0, "skipped": 0, "subscriptions": 0, "invoice_ids": []}
    subs = (
        await db.scalars(
            select(Subscription)
            .where(Subscription.id.in_(ids))
            .order_by(Subscription.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    existing = {
        (r[0], r[1])
        for r in await db.execute(
            select(Invoice.subscription_id, Invoice.period_start).where(
                Invoice.subscription_id.in_(ids), Invoice.status != "cancelled"
            )
        )
    }

    new_invoices: list[Invoice] = []
    for sub in subs:
        if sub.status != "active" or sub.is_paused:
            continue
        billed_any = False
        n = 0
        while sub.next_billing_date is not None and sub.next_billing_date <= as_of and n < max_periods:
            ps = sub.next_billing_date
            if sub.expiry_date is not None and ps > sub.expiry_date:
                sub.next_billing_date = None
                break
            nxt = next_period_start(sub.start_date, ps, sub.plan.billing_period)
            pe = nxt - timedelta(days=1)
            if sub.expiry_date is not None and pe > sub.expiry_date:
                pe = sub.expiry_date

            if (sub.id, ps) in existing:
                out["skipped"] += 1
            else:
                cands = candidate_discounts(sub.lines, sub.discount, ps)
                claimed = await _claim(db, sorted(cands))
                calc = compute(sub.lines, sub.discount, claimed)
                used = [cands[i].name for i in sorted(claimed)]
                inv = Invoice(
                    subscription_id=sub.id,
                    customer_id=sub.customer_id,
                    period_start=ps,
                    period_end=pe,
                    issue_date=ps,
                    due_date=ps + timedelta(days=terms_days(sub.payment_terms)),
                    status="draft",
                    subtotal=calc["subtotal"],
                    discount_total=calc["discount_total"],
                    tax_total=calc["tax_total"],
                    total=calc["total"],
                    amount_paid=ZERO,
                    discount_note=", ".join(used)[:300] or None,
                    payment_terms=sub.payment_terms,
                    lines=[
                        InvoiceLine(
                            product_id=r["line"].product_id,
                            description=line_description(r["line"]),
                            quantity=r["line"].quantity,
                            unit_price=r["line"].unit_price,
                            subtotal=r["subtotal"],
                            discount_amount=r["discount_amount"],
                            tax_name=r["line"].tax.name if r["line"].tax else None,
                            tax_rate=r["line"].tax.rate if r["line"].tax else 0,
                            tax_amount=r["tax_amount"],
                            total=r["total"],
                        )
                        for r in calc["rows"]
                    ],
                )
                db.add(inv)
                new_invoices.append(inv)
                existing.add((sub.id, ps))
                out["created"] += 1
                billed_any = True
            sub.next_billing_date = nxt
            n += 1

        if sub.expiry_date is not None and sub.next_billing_date is not None \
                and sub.next_billing_date > sub.expiry_date:
            sub.next_billing_date = None
        if billed_any:
            out["subscriptions"] += 1

    await db.flush()
    for inv in new_invoices:
        inv.number = f"INV-{inv.id:06d}"
    await db.commit()
    out["invoice_ids"] = [i.id for i in new_invoices]
    return out


async def close_expired(db: AsyncSession, as_of: date) -> int:
    """Plans marked auto-close end their subscriptions by themselves, once everything up to
    the expiry date has been invoiced."""
    subs = (
        await db.scalars(
            select(Subscription).where(
                Subscription.status == "active",
                Subscription.expiry_date.is_not(None),
                Subscription.expiry_date < as_of,
                Subscription.next_billing_date.is_(None),
            )
        )
    ).all()
    n = 0
    for s in subs:
        if s.plan.auto_close:
            s.status = "closed"
            s.is_paused = False
            s.closed_at = datetime.utcnow()
            n += 1
    await db.commit()
    return n


async def generate_due_invoices(
    db: AsyncSession,
    as_of: date | None = None,
    subscription_ids: list[int] | None = None,
    max_periods: int = 36,
) -> dict:
    """Create a draft invoice for every billing period that is due. Safe to run any number of
    times: periods that already have an invoice are skipped, never duplicated."""
    as_of = as_of or date.today()
    stmt = (
        select(Subscription.id)
        .where(
            Subscription.status == "active",
            Subscription.is_paused.is_(False),
            Subscription.next_billing_date.is_not(None),
            Subscription.next_billing_date <= as_of,
        )
        .order_by(Subscription.id)
    )
    if subscription_ids:
        stmt = stmt.where(Subscription.id.in_(subscription_ids))
    ids = list((await db.scalars(stmt)).all())

    total = {"created": 0, "skipped": 0, "subscriptions": 0, "errors": [], "invoice_ids": [], "closed": 0}

    def merge(part: dict):
        for k in ("created", "skipped", "subscriptions"):
            total[k] += part[k]
        total["invoice_ids"].extend(part["invoice_ids"])

    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        try:
            merge(await _process_chunk(db, chunk, as_of, max_periods))
        except IntegrityError:
            # Someone else billed one of these periods at the same moment. Nothing from this
            # chunk was kept, so redo it one subscription at a time.
            await db.rollback()
            for sid in chunk:
                try:
                    merge(await _process_chunk(db, [sid], as_of, max_periods))
                except IntegrityError:
                    await db.rollback()
                    total["errors"].append(f"Subscription {sid}: already billed by another run.")
    total["closed"] = await close_expired(db, as_of)
    return total
