from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.quotation import QuotationTemplate
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import TaxRule
from app.models.user import User, UserRole
from app.schemas.subscription import PriceRequest, StatusChange, SubscriptionIn
from app.services.pricing import price_line, sum_lines

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])
staff_or_admin = require_roles(UserRole.admin, UserRole.staff)

# status -> statuses it may move to
ALLOWED = {
    "draft": {"quotation", "closed"},
    "quotation": {"confirmed", "draft", "closed"},
    "confirmed": {"active", "closed"},
    "active": {"closed"},
    "closed": set(),
}


def _bad(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


def _unprocessable(message: str) -> HTTPException:
    return HTTPException(422, message)


# ---------- output shapes ----------
def _line_out(l: SubscriptionLine) -> dict:
    return {
        "id": l.id,
        "product_id": l.product_id,
        "product_name": l.product.name,
        "variant_id": l.variant_id,
        "variant_label": f"{l.variant.attribute}: {l.variant.value}" if l.variant else None,
        "quantity": l.quantity,
        "unit_price": l.unit_price,
        "tax_id": l.tax_id,
        "tax_name": l.tax.name if l.tax else None,
        "tax_rate": l.tax.rate if l.tax else None,
        "discount_id": l.discount_id,
        "discount_name": l.discount.name if l.discount else None,
        "subtotal": l.subtotal,
        "discount_amount": l.discount_amount,
        "tax_amount": l.tax_amount,
        "total": l.total,
    }


def _item_out(s: Subscription) -> dict:
    return {
        "id": s.id,
        "number": s.number,
        "status": s.status,
        "customer_id": s.customer_id,
        "customer_name": s.customer.full_name,
        "customer_email": s.customer.email,
        "customer_company": s.customer.company,
        "plan_id": s.plan_id,
        "plan_name": s.plan.name,
        "billing_period": s.plan.billing_period,
        "start_date": s.start_date,
        "expiry_date": s.expiry_date,
        "total": s.total,
        "created_at": s.created_at,
    }


def _full_out(s: Subscription) -> dict:
    return {
        **_item_out(s),
        "template_id": s.template_id,
        "payment_terms": s.payment_terms,
        "notes": s.notes,
        "quote_valid_until": s.quote_valid_until,
        "next_billing_date": s.next_billing_date,
        "subtotal": s.subtotal,
        "discount_total": s.discount_total,
        "tax_total": s.tax_total,
        "can_close_early": s.plan.can_close_early,
        "can_pause": s.plan.can_pause,
        "can_renew": s.plan.can_renew,
        "lines": [_line_out(l) for l in s.lines],
    }


async def _load(db: AsyncSession, sub_id: int) -> Subscription | None:
    return await db.scalar(
        select(Subscription).where(Subscription.id == sub_id).execution_options(populate_existing=True)
    )


# ---------- pricing + validation ----------
async def _price(db: AsyncSession, lines, on: date, existing: Subscription | None = None):
    """Check every reference and price every line. Anything archived can't be newly picked,
    but a subscription that already uses it can keep it."""

    async def fetch(model, ids):
        ids = {i for i in ids if i}
        if not ids:
            return {}
        return {o.id: o for o in (await db.scalars(select(model).where(model.id.in_(ids)))).all()}

    products = await fetch(Product, [l.product_id for l in lines])
    variants = await fetch(ProductVariant, [l.variant_id for l in lines])
    taxes = await fetch(TaxRule, [l.tax_id for l in lines])
    discounts = await fetch(Discount, [l.discount_id for l in lines])

    kept = {"product": set(), "tax": set(), "discount": set()}
    for ln in existing.lines if existing else []:
        kept["product"].add(ln.product_id)
        if ln.tax_id:
            kept["tax"].add(ln.tax_id)
        if ln.discount_id:
            kept["discount"].add(ln.discount_id)

    rows = []
    for i, l in enumerate(lines, start=1):
        where = f"Line {i}: "
        product = products.get(l.product_id)
        if product is None:
            raise _unprocessable(where + "that product doesn't exist.")
        if not product.is_active and product.id not in kept["product"]:
            raise _unprocessable(where + f"'{product.name}' is archived.")
        if l.variant_id:
            v = variants.get(l.variant_id)
            if v is None or v.product_id != l.product_id:
                raise _unprocessable(where + "that variant doesn't belong to the product.")
        tax = taxes.get(l.tax_id) if l.tax_id else None
        if l.tax_id and tax is None:
            raise _unprocessable(where + "that tax rule doesn't exist.")
        if tax is not None and not tax.is_active and tax.id not in kept["tax"]:
            raise _unprocessable(where + f"tax rule '{tax.name}' is archived.")
        discount = discounts.get(l.discount_id) if l.discount_id else None
        if l.discount_id and discount is None:
            raise _unprocessable(where + "that discount doesn't exist.")
        if discount is not None and not discount.is_active and discount.id not in kept["discount"]:
            raise _unprocessable(where + f"discount '{discount.name}' is archived.")
        priced = price_line(l.quantity, l.unit_price, discount=discount, tax=tax, on=on)
        rows.append((l, priced))
    return rows, sum_lines([p for _, p in rows])


async def _validate(db: AsyncSession, body: SubscriptionIn, existing: Subscription | None = None):
    customer = await db.get(User, body.customer_id)
    if customer is None or customer.role != UserRole.customer or not customer.is_active:
        raise _unprocessable("Pick an active customer.")
    plan = await db.get(Plan, body.plan_id)
    if plan is None:
        raise _unprocessable("Pick a plan.")
    if not plan.is_active and (existing is None or existing.plan_id != plan.id):
        raise _unprocessable(f"Plan '{plan.name}' is archived.")
    if (plan.available_from and body.start_date < plan.available_from) or (
        plan.available_to and body.start_date > plan.available_to
    ):
        raise _unprocessable("This plan isn't available on the chosen start date.")
    if sum(l.quantity for l in body.lines) < plan.min_quantity:
        raise _unprocessable(f"This plan needs a total quantity of at least {plan.min_quantity}.")
    template = None
    if body.template_id:
        template = await db.get(QuotationTemplate, body.template_id)
        if template is None:
            raise _unprocessable("That quotation template doesn't exist.")
    return template


def _make_line(l, p: dict) -> SubscriptionLine:
    return SubscriptionLine(
        product_id=l.product_id,
        variant_id=l.variant_id,
        quantity=l.quantity,
        unit_price=l.unit_price,
        tax_id=l.tax_id,
        discount_id=l.discount_id,
        subtotal=p["subtotal"],
        discount_amount=p["discount_amount"],
        tax_amount=p["tax_amount"],
        total=p["total"],
    )


def _used_discounts(sub: Subscription) -> dict[int, Discount]:
    """The discounts that actually took money off this subscription."""
    return {l.discount_id: l.discount for l in sub.lines if l.discount_id and l.discount_amount > 0}


# ---------- helper endpoints for the screens (declared before /{sub_id}) ----------
@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)):
    rows = (await db.execute(select(Subscription.status, func.count()).group_by(Subscription.status))).all()
    counts = {s: 0 for s in ALLOWED}
    counts.update({r[0]: r[1] for r in rows})
    counts["all"] = sum(counts.values())
    return counts


@router.get("/options")
async def options(db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)):
    """Everything the subscription editor needs in one call."""
    plans = (await db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.name))).all()
    products = (await db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name))).all()
    taxes = (await db.scalars(select(TaxRule).where(TaxRule.is_active.is_(True)).order_by(TaxRule.name))).all()
    discounts = (await db.scalars(select(Discount).where(Discount.is_active.is_(True)).order_by(Discount.name))).all()
    templates = (
        await db.scalars(
            select(QuotationTemplate).where(QuotationTemplate.is_active.is_(True)).order_by(QuotationTemplate.name)
        )
    ).all()
    return {
        "plans": [
            {"id": p.id, "name": p.name, "price": p.price, "billing_period": p.billing_period,
             "min_quantity": p.min_quantity, "available_from": p.available_from, "available_to": p.available_to}
            for p in plans
        ],
        "products": [
            {"id": p.id, "name": p.name, "sales_price": p.sales_price,
             "variants": [{"id": v.id, "attribute": v.attribute, "value": v.value, "extra_price": v.extra_price}
                          for v in p.variants]}
            for p in products
        ],
        "taxes": [{"id": t.id, "name": t.name, "rate": t.rate} for t in taxes],
        "discounts": [
            {"id": d.id, "name": d.name, "discount_type": d.discount_type, "value": d.value,
             "min_quantity": d.min_quantity, "min_purchase": d.min_purchase}
            for d in discounts
        ],
        "templates": [
            {"id": t.id, "name": t.name, "plan_id": t.plan_id, "validity_days": t.validity_days}
            for t in templates
        ],
    }


@router.get("/customers")
async def customers(
    q: str | None = None, db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)
):
    stmt = (
        select(User)
        .where(User.role == UserRole.customer, User.is_active.is_(True))
        .order_by(User.full_name)
        .limit(20)
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.company.ilike(like)))
    return [
        {"id": u.id, "full_name": u.full_name, "email": u.email, "company": u.company}
        for u in (await db.scalars(stmt)).all()
    ]


@router.get("/from-template/{template_id}")
async def from_template(
    template_id: int, db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)
):
    t = await db.get(QuotationTemplate, template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found.")
    return {
        "plan_id": t.plan_id,
        "validity_days": t.validity_days,
        "lines": [
            {"product_id": l.product_id, "variant_id": l.variant_id, "quantity": l.quantity,
             "unit_price": l.unit_price, "tax_id": l.tax_id, "discount_id": l.discount_id}
            for l in t.lines
        ],
    }


@router.post("/price")
async def price(body: PriceRequest, db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)):
    """Live totals for the editor, using exactly the same maths as saving."""
    existing = await _load(db, body.subscription_id) if body.subscription_id else None
    rows, totals = await _price(db, body.lines, date.today(), existing)
    return {"lines": [p for _, p in rows], **totals}


# ---------- CRUD ----------
@router.get("")
async def list_subscriptions(
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None, description="Number, customer name, email or company"),
    customer_id: int | None = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _u=Depends(staff_or_admin),
):
    stmt = select(Subscription).order_by(Subscription.id.desc()).limit(limit).offset(offset)
    if status_filter:
        stmt = stmt.where(Subscription.status == status_filter)
    if customer_id:
        stmt = stmt.where(Subscription.customer_id == customer_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Subscription.number.ilike(like),
                Subscription.customer.has(
                    or_(User.full_name.ilike(like), User.email.ilike(like), User.company.ilike(like))
                ),
            )
        )
    return [_item_out(s) for s in (await db.scalars(stmt)).all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: SubscriptionIn, db: AsyncSession = Depends(get_db), user: User = Depends(staff_or_admin)
):
    template = await _validate(db, body)
    rows, totals = await _price(db, body.lines, date.today())
    sub = Subscription(
        status="draft",
        customer_id=body.customer_id,
        plan_id=body.plan_id,
        template_id=body.template_id,
        start_date=body.start_date,
        expiry_date=body.expiry_date,
        payment_terms=body.payment_terms,
        notes=(body.notes or "").strip() or None,
        quote_valid_until=(date.today() + timedelta(days=template.validity_days)) if template else None,
        created_by_id=user.id,
        **totals,
    )
    sub.lines = [_make_line(l, p) for l, p in rows]
    db.add(sub)
    await db.flush()
    sub.number = f"SUB-{sub.id:05d}"
    await db.commit()
    return _full_out(await _load(db, sub.id))


@router.get("/{sub_id}")
async def get_subscription(
    sub_id: int, db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)
):
    sub = await _load(db, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    return _full_out(sub)


@router.put("/{sub_id}")
async def update_subscription(
    sub_id: int,
    body: SubscriptionIn,
    db: AsyncSession = Depends(get_db),
    _u=Depends(staff_or_admin),
):
    sub = await _load(db, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    if sub.status not in ("draft", "quotation"):
        raise _bad("Only draft or quotation subscriptions can be edited.")
    template = await _validate(db, body, existing=sub)
    rows, totals = await _price(db, body.lines, date.today(), existing=sub)

    sub.customer_id = body.customer_id
    sub.plan_id = body.plan_id
    sub.template_id = body.template_id
    sub.start_date = body.start_date
    sub.expiry_date = body.expiry_date
    sub.payment_terms = body.payment_terms
    sub.notes = (body.notes or "").strip() or None
    if template and sub.quote_valid_until is None:
        sub.quote_valid_until = date.today() + timedelta(days=template.validity_days)
    for key, value in totals.items():
        setattr(sub, key, value)
    sub.lines.clear()
    sub.lines.extend(_make_line(l, p) for l, p in rows)
    await db.commit()
    return _full_out(await _load(db, sub_id))


@router.post("/{sub_id}/status")
async def change_status(
    sub_id: int,
    body: StatusChange,
    db: AsyncSession = Depends(get_db),
    _u=Depends(staff_or_admin),
):
    sub = await _load(db, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    target, today = body.status, date.today()
    if target not in ALLOWED[sub.status]:
        raise _bad(f"A {sub.status} subscription can't move to {target}.")

    if target == "confirmed":
        if sub.quote_valid_until and sub.quote_valid_until < today:
            raise _bad("This quotation has expired. Move it back to draft and send it again.")
        # a discount with a usage limit gets used up when the subscription is confirmed
        used = _used_discounts(sub)
        for d in used.values():
            if d.usage_limit is not None and d.used_count >= d.usage_limit:
                raise _bad(f"Discount '{d.name}' has reached its usage limit. Edit the lines to remove it.")
        for d in used.values():
            d.used_count += 1
    if sub.status == "confirmed" and target == "closed":
        for d in _used_discounts(sub).values():  # cancelled before starting: hand the use back
            d.used_count = max(0, d.used_count - 1)
    if target == "active":
        if sub.start_date > today:
            raise _bad(f"This subscription starts on {sub.start_date:%d %b %Y}. It can be activated then.")
        if sub.expiry_date < today:
            raise _bad("This subscription has already passed its expiry date.")
        sub.next_billing_date = sub.next_billing_date or sub.start_date
    if target == "closed" and sub.status == "active":
        if today < sub.expiry_date and not sub.plan.can_close_early:
            raise _bad("This plan doesn't allow closing early. It can be closed on the expiry date.")

    sub.status = target
    await db.commit()
    return _full_out(await _load(db, sub_id))


@router.delete("/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    sub_id: int, db: AsyncSession = Depends(get_db), _u=Depends(staff_or_admin)
):
    sub = await _load(db, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found.")
    if sub.status != "draft":
        raise _bad("Only drafts can be deleted. Close the subscription instead.")
    await db.delete(sub)
    await db.commit()
