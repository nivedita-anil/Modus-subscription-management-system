from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.user import User, UserRole
from app.schemas.invoice import PaymentIn, PaymentOut, PaymentPage

router = APIRouter(prefix="/payments", tags=["payments"])
staff_or_admin = require_roles(UserRole.admin, UserRole.staff)


@router.get("", response_model=PaymentPage)
async def list_payments(
    q: str | None = None,
    method: str | None = None,
    invoice_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    def filt(stmt):
        stmt = stmt.join(Invoice, Invoice.id == Payment.invoice_id).join(User, User.id == Invoice.customer_id)
        if method:
            stmt = stmt.where(Payment.method == method)
        if invoice_id:
            stmt = stmt.where(Payment.invoice_id == invoice_id)
        if date_from:
            stmt = stmt.where(Payment.paid_on >= date_from)
        if date_to:
            stmt = stmt.where(Payment.paid_on <= date_to)
        if q and q.strip():
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(Invoice.number.ilike(like), User.full_name.ilike(like), Payment.note.ilike(like))
            )
        return stmt

    total, amount_total = (
        await db.execute(filt(select(func.count(), func.coalesce(func.sum(Payment.amount), 0)).select_from(Payment)))
    ).one()
    rows = await db.execute(
        filt(
            select(
                Payment.id, Payment.invoice_id, Invoice.number, User.full_name, Payment.method,
                Payment.amount, Payment.paid_on, Payment.note, Payment.created_at,
            ).select_from(Payment)
        )
        .order_by(Payment.paid_on.desc(), Payment.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = [
        PaymentOut(
            id=r.id, invoice_id=r.invoice_id, invoice_number=r.number, customer_name=r.full_name,
            method=r.method, amount=r.amount, paid_on=r.paid_on, note=r.note, created_at=r.created_at,
        )
        for r in rows
    ]
    return PaymentPage(items=items, total=total, page=page, page_size=page_size, amount_total=amount_total)


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def record_payment(
    body: PaymentIn, db: AsyncSession = Depends(get_db), user: User = Depends(staff_or_admin)
):
    """Record money received against an invoice. A full payment marks it Paid."""
    inv = await db.scalar(
        select(Invoice).where(Invoice.id == body.invoice_id).execution_options(populate_existing=True)
    )
    if inv is None:
        raise HTTPException(404, "Invoice not found.")
    if inv.status == "draft":
        raise HTTPException(409, "Confirm the invoice before recording a payment.")
    if inv.status == "cancelled":
        raise HTTPException(409, "This invoice is cancelled.")
    if inv.status == "paid":
        raise HTTPException(409, "This invoice is already paid in full.")

    # One atomic step: only add the money if the invoice is still open and it doesn't overpay.
    res = await db.execute(
        update(Invoice)
        .where(
            Invoice.id == inv.id,
            Invoice.status == "confirmed",
            Invoice.amount_paid + body.amount <= Invoice.total,
        )
        .values(amount_paid=Invoice.amount_paid + body.amount)
        .execution_options(synchronize_session=False)
    )
    if res.rowcount != 1:
        balance = inv.total - inv.amount_paid  # read before the rollback expires `inv`
        await db.rollback()
        raise HTTPException(409, f"That is more than the amount still owed ({balance}).")

    pay = Payment(
        invoice_id=inv.id, method=body.method, amount=body.amount,
        paid_on=body.paid_on or date.today(), note=(body.note or "").strip() or None,
        recorded_by_id=user.id,
    )
    db.add(pay)
    await db.flush()
    fresh = await db.scalar(
        select(Invoice).where(Invoice.id == inv.id).execution_options(populate_existing=True)
    )
    if fresh.amount_paid >= fresh.total:
        fresh.status = "paid"
    await db.commit()
    customer = await db.get(User, fresh.customer_id)
    return PaymentOut(
        id=pay.id, invoice_id=pay.invoice_id, invoice_number=fresh.number,
        customer_name=customer.full_name, method=pay.method, amount=pay.amount,
        paid_on=pay.paid_on, note=pay.note, created_at=pay.created_at,
    )
