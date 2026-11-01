from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.quotation import QuotationTemplate
from app.models.subscription import Subscription, SubscriptionLine
from app.models.user import User, UserRole
from app.schemas.subscription import (
    ActionIn, SubscriptionIn, SubscriptionOut, SubscriptionPage, TransitionIn,
)
from app.services.serializers import subscription_out
from app.services.subscriptions import bad, check_plan_rules, resolve_lines, run_action, transition

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
staff_or_admin = require_roles(UserRole.admin, UserRole.staff)


async def _load(db: AsyncSession, sub_id: int) -> Subscription:
    sub = await db.scalar(
        select(Subscription).where(Subscription.id == sub_id).execution_options(populate_existing=True)
    )
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    return sub


async def _prepare(db: AsyncSession, body: SubscriptionIn, existing: Subscription | None = None):
    customer = await db.get(User, body.customer_id)
    if customer is None or customer.role != UserRole.customer:
        raise bad("Pick a customer account.")
    if not customer.is_active:
        raise bad("That customer account is deactivated.")

    plan = await db.get(Plan, body.plan_id)
    if plan is None:
        raise bad("Plan not found.")
    if not plan.is_active and (existing is None or existing.plan_id != plan.id):
        raise bad(f"Plan '{plan.name}' is archived.")

    if body.discount_id is not None:
        d = await db.get(Discount, body.discount_id)
        if d is None:
            raise bad("Discount not found.")
        if not d.is_active and (existing is None or existing.discount_id != d.id):
            raise bad(f"Discount '{d.name}' is archived.")

    valid_until = None
    template = None
    if body.template_id is not None:
        template = await db.get(QuotationTemplate, body.template_id)
        if template is None:
            raise bad("Quotation template not found.")
        valid_until = date.today() + timedelta(days=template.validity_days)

    if body.lines:
        keep = {"product": set(), "tax": set(), "discount": set()}
        if existing is not None:
            for ln in existing.lines:
                keep["product"].add(ln.product_id)
                if ln.tax_id:
                    keep["tax"].add(ln.tax_id)
                if ln.discount_id:
                    keep["discount"].add(ln.discount_id)
        lines = await resolve_lines(db, body.lines, keep)
    elif template is not None:
        lines = [
            SubscriptionLine(
                product_id=t.product_id, variant_id=t.variant_id, quantity=t.quantity,
                unit_price=t.unit_price, tax_id=t.tax_id, discount_id=t.discount_id,
            )
            for t in template.lines
        ]
    else:
        raise bad("Add at least one line, or start from a quotation template.")

    check_plan_rules(plan, body.start_date, body.expiry_date, sum(l.quantity for l in lines))
    return customer, plan, lines, valid_until


@router.get("", response_model=SubscriptionPage)
async def list_subscriptions(
    q: str | None = Query(None, description="Number, customer name, email or company"),
    status_: str | None = Query(None, alias="status"),
    customer_id: int | None = None,
    plan_id: int | None = None,
    due: bool = Query(False, description="Only active subscriptions that are due for billing"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    amount = (
        select(func.coalesce(func.sum(SubscriptionLine.quantity * SubscriptionLine.unit_price), 0))
        .where(SubscriptionLine.subscription_id == Subscription.id)
        .correlate(Subscription)
        .scalar_subquery()
    )

    def filt(stmt):
        if status_:
            stmt = stmt.where(Subscription.status == status_)
        if customer_id:
            stmt = stmt.where(Subscription.customer_id == customer_id)
        if plan_id:
            stmt = stmt.where(Subscription.plan_id == plan_id)
        if due:
            stmt = stmt.where(
                Subscription.status == "active",
                Subscription.is_paused.is_(False),
                Subscription.next_billing_date <= date.today(),
            )
        if q and q.strip():
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    Subscription.number.ilike(like), User.full_name.ilike(like),
                    User.email.ilike(like), User.company.ilike(like),
                )
            )
        return stmt

    joins = lambda s: s.join(User, User.id == Subscription.customer_id).join(Plan, Plan.id == Subscription.plan_id)
    total = await db.scalar(filt(joins(select(func.count()).select_from(Subscription))))
    rows = await db.execute(
        filt(
            joins(
                select(
                    Subscription.id, Subscription.number, Subscription.status, Subscription.is_paused,
                    Subscription.customer_id, User.full_name, User.company,
                    Subscription.plan_id, Plan.name.label("plan_name"), Plan.billing_period,
                    Subscription.start_date, Subscription.expiry_date, Subscription.next_billing_date,
                    amount.label("amount"),
                ).select_from(Subscription)
            )
        )
        .order_by(Subscription.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = [
        {
            "id": r.id, "number": r.number, "status": r.status, "is_paused": r.is_paused,
            "customer_id": r.customer_id, "customer_name": r.full_name, "customer_company": r.company,
            "plan_id": r.plan_id, "plan_name": r.plan_name, "billing_period": r.billing_period,
            "start_date": r.start_date, "expiry_date": r.expiry_date,
            "next_billing_date": r.next_billing_date, "amount": r.amount,
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{sub_id}", response_model=SubscriptionOut)
async def get_subscription(sub_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)):
    return await subscription_out(db, await _load(db, sub_id))


@router.post("", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: SubscriptionIn, db: AsyncSession = Depends(get_db), user: User = Depends(staff_or_admin)
):
    _c, _p, lines, valid_until = await _prepare(db, body)
    sub = Subscription(
        customer_id=body.customer_id, plan_id=body.plan_id, template_id=body.template_id,
        discount_id=body.discount_id, status="draft", start_date=body.start_date,
        expiry_date=body.expiry_date, payment_terms=body.payment_terms,
        quotation_valid_until=valid_until, notes=(body.notes or "").strip() or None,
        created_by_id=user.id, lines=lines,
    )
    db.add(sub)
    await db.flush()
    sub.number = f"SUB-{sub.id:06d}"
    await db.commit()
    return await subscription_out(db, await _load(db, sub.id))


@router.put("/{sub_id}", response_model=SubscriptionOut)
async def update_subscription(
    sub_id: int, body: SubscriptionIn, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    """Only drafts and quotations can be edited. The lines in the request replace the old ones."""
    sub = await _load(db, sub_id)
    if sub.status not in ("draft", "quotation"):
        raise bad("Only a draft or quotation can be edited.", 409)
    _c, _p, lines, valid_until = await _prepare(db, body, existing=sub)
    sub.customer_id, sub.plan_id, sub.discount_id = body.customer_id, body.plan_id, body.discount_id
    sub.start_date, sub.expiry_date, sub.payment_terms = body.start_date, body.expiry_date, body.payment_terms
    sub.notes = (body.notes or "").strip() or None
    if body.template_id is not None:
        sub.template_id = body.template_id
        sub.quotation_valid_until = valid_until
    sub.lines = lines
    await db.commit()
    return await subscription_out(db, await _load(db, sub_id))


@router.post("/{sub_id}/transition", response_model=SubscriptionOut)
async def move_subscription(
    sub_id: int, body: TransitionIn, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    sub = await _load(db, sub_id)
    await transition(db, sub, body.to)
    return await subscription_out(db, await _load(db, sub_id))


@router.post("/{sub_id}/action", response_model=SubscriptionOut)
async def subscription_action(
    sub_id: int, body: ActionIn, db: AsyncSession = Depends(get_db), user: User = Depends(staff_or_admin)
):
    sub = await _load(db, sub_id)
    await run_action(db, sub, body.action, user.role)
    return await subscription_out(db, await _load(db, sub_id))
