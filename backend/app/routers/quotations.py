from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.tax import TaxRule
from app.models.user import UserRole
from app.schemas.quotation import QuotationTemplateIn, QuotationTemplateOut
from app.services.pricing import ZERO, money, price_line

router = APIRouter(prefix="/quotation-templates", tags=["quotation templates"])

staff_or_admin = require_roles(UserRole.admin, UserRole.staff)


def _bad(message: str) -> HTTPException:
    return HTTPException(422, message)


async def _load(db: AsyncSession, template_id: int) -> QuotationTemplate | None:
    return await db.scalar(
        select(QuotationTemplate)
        .where(QuotationTemplate.id == template_id)
        .execution_options(populate_existing=True)
    )


async def _name_taken(db: AsyncSession, name: str, exclude_id: int | None = None) -> bool:
    stmt = select(QuotationTemplate.id).where(QuotationTemplate.name.ilike(name))
    if exclude_id is not None:
        stmt = stmt.where(QuotationTemplate.id != exclude_id)
    return (await db.scalar(stmt)) is not None


def _to_out(t: QuotationTemplate) -> QuotationTemplateOut:
    lines = []
    totals = {"subtotal": ZERO, "discount_amount": ZERO, "tax_amount": ZERO, "total": ZERO}
    for ln in t.lines:
        p = price_line(ln.quantity, ln.unit_price, ln.discount, ln.tax)
        for k in totals:
            totals[k] += p[k]
        lines.append(
            {
                "id": ln.id,
                "product_id": ln.product_id,
                "product_name": ln.product.name,
                "variant_id": ln.variant_id,
                "variant_label": f"{ln.variant.attribute}: {ln.variant.value}" if ln.variant else None,
                "quantity": ln.quantity,
                "unit_price": ln.unit_price,
                "tax_id": ln.tax_id,
                "tax_name": ln.tax.name if ln.tax else None,
                "tax_rate": ln.tax.rate if ln.tax else None,
                "discount_id": ln.discount_id,
                "discount_name": ln.discount.name if ln.discount else None,
                **p,
            }
        )
    return QuotationTemplateOut(
        id=t.id,
        name=t.name,
        plan_id=t.plan_id,
        plan_name=t.plan.name,
        billing_period=t.plan.billing_period,
        validity_days=t.validity_days,
        notes=t.notes,
        is_active=t.is_active,
        created_at=t.created_at,
        lines=lines,
        subtotal=totals["subtotal"],
        discount_total=totals["discount_amount"],
        tax_total=totals["tax_amount"],
        total=totals["total"],
    )


async def _build_lines(
    db: AsyncSession, body: QuotationTemplateIn, existing: QuotationTemplate | None = None
) -> list[QuotationTemplateLine]:
    """Check every reference and turn the request lines into rows.
    Something that is archived can't be newly picked, but a template that already
    uses it can keep it."""
    kept = {"product": set(), "tax": set(), "discount": set()}
    if existing is not None:
        for ln in existing.lines:
            kept["product"].add(ln.product_id)
            if ln.tax_id:
                kept["tax"].add(ln.tax_id)
            if ln.discount_id:
                kept["discount"].add(ln.discount_id)

    rows: list[QuotationTemplateLine] = []
    for i, ln in enumerate(body.lines, start=1):
        where = f"Line {i}: "

        product = await db.get(Product, ln.product_id)
        if product is None:
            raise _bad(where + "product not found.")
        if not product.is_active and product.id not in kept["product"]:
            raise _bad(where + f"'{product.name}' is archived.")

        variant = None
        if ln.variant_id is not None:
            variant = await db.get(ProductVariant, ln.variant_id)
            if variant is None or variant.product_id != product.id:
                raise _bad(where + "that variant doesn't belong to the chosen product.")

        unit_price = ln.unit_price
        if unit_price is None:
            unit_price = money(product.sales_price + (variant.extra_price if variant else 0))

        tax = None
        if ln.tax_id is not None:
            tax = await db.get(TaxRule, ln.tax_id)
            if tax is None:
                raise _bad(where + "tax rule not found.")
            if not tax.is_active and tax.id not in kept["tax"]:
                raise _bad(where + f"tax rule '{tax.name}' is archived.")

        discount = None
        if ln.discount_id is not None:
            discount = await db.get(Discount, ln.discount_id)
            if discount is None:
                raise _bad(where + "discount not found.")
            if not discount.is_active and discount.id not in kept["discount"]:
                raise _bad(where + f"discount '{discount.name}' is archived.")
            gross = money(Decimal(ln.quantity) * Decimal(unit_price))
            if ln.quantity < discount.min_quantity:
                raise _bad(where + f"'{discount.name}' needs a quantity of at least {discount.min_quantity}.")
            if gross < discount.min_purchase:
                raise _bad(where + f"'{discount.name}' needs a line total of at least {discount.min_purchase}.")

        rows.append(
            QuotationTemplateLine(
                product_id=product.id,
                variant_id=variant.id if variant else None,
                quantity=ln.quantity,
                unit_price=unit_price,
                tax_id=tax.id if tax else None,
                discount_id=discount.id if discount else None,
            )
        )
    return rows


async def _check_plan(db: AsyncSession, plan_id: int, current_plan_id: int | None) -> None:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise _bad("Plan not found.")
    if not plan.is_active and plan_id != current_plan_id:
        raise _bad(f"Plan '{plan.name}' is archived.")


@router.get("", response_model=list[QuotationTemplateOut])
async def list_templates(
    q: str | None = Query(None, description="Search by name"),
    active: bool | None = None,
    plan_id: int | None = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    stmt = select(QuotationTemplate).order_by(QuotationTemplate.id.desc()).limit(limit).offset(offset)
    if q and q.strip():
        stmt = stmt.where(QuotationTemplate.name.ilike(f"%{q.strip()}%"))
    if active is not None:
        stmt = stmt.where(QuotationTemplate.is_active == active)
    if plan_id is not None:
        stmt = stmt.where(QuotationTemplate.plan_id == plan_id)
    return [_to_out(t) for t in (await db.scalars(stmt)).all()]


@router.get("/{template_id}", response_model=QuotationTemplateOut)
async def get_template(
    template_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    template = await _load(db, template_id)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quotation template not found.")
    return _to_out(template)


@router.post("", response_model=QuotationTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: QuotationTemplateIn, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    name = body.name.strip()
    if await _name_taken(db, name):
        raise HTTPException(status.HTTP_409_CONFLICT, "A quotation template with this name already exists.")
    await _check_plan(db, body.plan_id, None)
    lines = await _build_lines(db, body)
    template = QuotationTemplate(
        name=name,
        plan_id=body.plan_id,
        validity_days=body.validity_days,
        notes=(body.notes or "").strip() or None,
        is_active=body.is_active,
        lines=lines,
    )
    db.add(template)
    await db.commit()
    return _to_out(await _load(db, template.id))


@router.put("/{template_id}", response_model=QuotationTemplateOut)
async def update_template(
    template_id: int,
    body: QuotationTemplateIn,
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    """Full update. The lines in the request replace the existing ones."""
    template = await _load(db, template_id)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quotation template not found.")
    name = body.name.strip()
    if await _name_taken(db, name, exclude_id=template_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A quotation template with this name already exists.")
    await _check_plan(db, body.plan_id, template.plan_id)
    new_lines = await _build_lines(db, body, existing=template)

    template.name = name
    template.plan_id = body.plan_id
    template.validity_days = body.validity_days
    template.notes = (body.notes or "").strip() or None
    template.is_active = body.is_active
    template.lines = new_lines  # delete-orphan removes the old rows
    await db.commit()
    return _to_out(await _load(db, template_id))
