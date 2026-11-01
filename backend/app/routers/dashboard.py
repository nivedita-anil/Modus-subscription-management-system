from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import UserRole
from app.services.pricing import money

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
staff_or_admin = require_roles(UserRole.admin, UserRole.staff)


def _dec(x) -> Decimal:
    return money(Decimal(str(x or 0)))


def _month_start(d: date, back: int) -> date:
    m = d.year * 12 + d.month - 1 - back
    return date(m // 12, m % 12 + 1, 1)


@router.get("/summary")
async def summary(
    date_from: date | None = None,
    date_to: date | None = None,
    all_time: bool = False,
    plan_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    """Everything the finance lead asks for, in a handful of aggregate queries (no row loops)."""
    today = date.today()
    if all_time:
        date_from = date_to = None
    else:
        date_to = date_to or today
        date_from = date_from or today.replace(day=1)

    def by_plan_invoice(stmt):  # invoice-based queries filtered by plan
        if plan_id:
            stmt = stmt.join(Subscription, Subscription.id == Invoice.subscription_id).where(
                Subscription.plan_id == plan_id
            )
        return stmt

    # --- subscriptions
    sub_stmt = select(Subscription.status, func.count()).group_by(Subscription.status)
    if plan_id:
        sub_stmt = sub_stmt.where(Subscription.plan_id == plan_id)
    status_counts = {s: 0 for s in ("draft", "quotation", "confirmed", "active", "closed")}
    for s, n in (await db.execute(sub_stmt)).all():
        status_counts[s] = n

    paused_stmt = select(func.count()).select_from(Subscription).where(
        Subscription.status == "active", Subscription.is_paused.is_(True)
    )
    due_stmt = select(func.count()).select_from(Subscription).where(
        Subscription.status == "active", Subscription.is_paused.is_(False),
        Subscription.next_billing_date <= today,
    )
    if plan_id:
        paused_stmt = paused_stmt.where(Subscription.plan_id == plan_id)
        due_stmt = due_stmt.where(Subscription.plan_id == plan_id)
    paused = await db.scalar(paused_stmt)
    due_for_billing = await db.scalar(due_stmt)

    # --- monthly recurring revenue (before discounts and tax), every period normalised to a month
    factor = case(
        (Plan.billing_period == "daily", 30.0),
        (Plan.billing_period == "weekly", 52.0 / 12.0),
        (Plan.billing_period == "yearly", 1.0 / 12.0),
        else_=1.0,
    )
    mrr_stmt = (
        select(func.coalesce(func.sum(SubscriptionLine.quantity * SubscriptionLine.unit_price * factor), 0))
        .select_from(SubscriptionLine)
        .join(Subscription, Subscription.id == SubscriptionLine.subscription_id)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "active", Subscription.is_paused.is_(False))
    )
    if plan_id:
        mrr_stmt = mrr_stmt.where(Subscription.plan_id == plan_id)
    mrr = _dec(await db.scalar(mrr_stmt))

    # --- money
    def pay_range(stmt):
        if date_from:
            stmt = stmt.where(Payment.paid_on >= date_from)
        if date_to:
            stmt = stmt.where(Payment.paid_on <= date_to)
        return stmt

    def inv_range(stmt):
        if date_from:
            stmt = stmt.where(Invoice.issue_date >= date_from)
        if date_to:
            stmt = stmt.where(Invoice.issue_date <= date_to)
        return stmt

    pay_base = select(func.coalesce(func.sum(Payment.amount), 0), func.count()).select_from(Payment)
    if plan_id:
        pay_base = pay_base.join(Invoice, Invoice.id == Payment.invoice_id).join(
            Subscription, Subscription.id == Invoice.subscription_id
        ).where(Subscription.plan_id == plan_id)
    collected, payments_count = (await db.execute(pay_range(pay_base))).one()

    invoiced, invoices_count = (
        await db.execute(
            inv_range(
                by_plan_invoice(
                    select(func.coalesce(func.sum(Invoice.total), 0), func.count()).select_from(Invoice)
                ).where(Invoice.status != "cancelled")
            )
        )
    ).one()

    owed = Invoice.total - Invoice.amount_paid
    outstanding, outstanding_count = (
        await db.execute(
            by_plan_invoice(
                select(func.coalesce(func.sum(owed), 0), func.count()).select_from(Invoice)
            ).where(Invoice.status == "confirmed")
        )
    ).one()
    overdue, overdue_count = (
        await db.execute(
            by_plan_invoice(
                select(func.coalesce(func.sum(owed), 0), func.count()).select_from(Invoice)
            ).where(Invoice.status == "confirmed", Invoice.due_date < today, Invoice.total > Invoice.amount_paid)
        )
    ).one()
    draft_invoices = await db.scalar(
        by_plan_invoice(select(func.count()).select_from(Invoice)).where(Invoice.status == "draft")
    )

    # --- last six months, collected vs invoiced
    first = _month_start(today, 5)
    ym = lambda col: (extract("year", col), extract("month", col))
    pay_series = pay_base_months = (
        select(*ym(Payment.paid_on), func.sum(Payment.amount)).select_from(Payment)
    )
    if plan_id:
        pay_series = pay_series.join(Invoice, Invoice.id == Payment.invoice_id).join(
            Subscription, Subscription.id == Invoice.subscription_id
        ).where(Subscription.plan_id == plan_id)
    pay_rows = (
        await db.execute(pay_series.where(Payment.paid_on >= first).group_by(*ym(Payment.paid_on)))
    ).all()
    inv_rows = (
        await db.execute(
            by_plan_invoice(select(*ym(Invoice.issue_date), func.sum(Invoice.total)).select_from(Invoice))
            .where(Invoice.status != "cancelled", Invoice.issue_date >= first)
            .group_by(*ym(Invoice.issue_date))
        )
    ).all()
    pay_map = {(int(y), int(m)): v for y, m, v in pay_rows}
    inv_map = {(int(y), int(m)): v for y, m, v in inv_rows}
    months = []
    for back in range(5, -1, -1):
        d = _month_start(today, back)
        months.append(
            {
                "month": d.strftime("%b %Y"),
                "collected": _dec(pay_map.get((d.year, d.month))),
                "invoiced": _dec(inv_map.get((d.year, d.month))),
            }
        )

    return {
        "range": {"date_from": date_from, "date_to": date_to, "all_time": all_time, "plan_id": plan_id},
        "subscriptions": {
            "active": status_counts["active"], "paused": paused,
            "due_for_billing": due_for_billing, "by_status": status_counts,
            "total": sum(status_counts.values()),
        },
        "mrr": mrr,
        "revenue_collected": _dec(collected), "payments_count": payments_count,
        "invoiced": _dec(invoiced), "invoices_count": invoices_count,
        "outstanding": _dec(outstanding), "outstanding_count": outstanding_count,
        "overdue": _dec(overdue), "overdue_count": overdue_count,
        "draft_invoices": draft_invoices,
        "months": months,
    }
