from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.invoice import Invoice
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.schemas.invoice import BulkConfirmIn, GenerateIn, GenerateOut, InvoiceOut, InvoicePage
from app.services.billing import generate_due_invoices
from app.services.email_service import send_email
from app.services.serializers import invoice_out, overdue_info

router = APIRouter(prefix="/invoices", tags=["invoices"])
staff_or_admin = require_roles(UserRole.admin, UserRole.staff)


async def _load(db: AsyncSession, invoice_id: int) -> Invoice:
    inv = await db.scalar(
        select(Invoice).where(Invoice.id == invoice_id).execution_options(populate_existing=True)
    )
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    return inv


def apply_filters(stmt, *, status_, overdue, customer_id, subscription_id, q, date_from, date_to, statuses=None):
    if statuses:
        stmt = stmt.where(Invoice.status.in_(statuses))
    if status_:
        stmt = stmt.where(Invoice.status == status_)
    if overdue:
        stmt = stmt.where(
            Invoice.status == "confirmed",
            Invoice.due_date < date.today(),
            Invoice.total > Invoice.amount_paid,
        )
    if customer_id:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if subscription_id:
        stmt = stmt.where(Invoice.subscription_id == subscription_id)
    if date_from:
        stmt = stmt.where(Invoice.issue_date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.issue_date <= date_to)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Invoice.number.ilike(like), Subscription.number.ilike(like),
                User.full_name.ilike(like), User.email.ilike(like), User.company.ilike(like),
            )
        )
    return stmt


def _join(stmt):
    return stmt.join(User, User.id == Invoice.customer_id).join(
        Subscription, Subscription.id == Invoice.subscription_id
    )


async def invoice_page(db: AsyncSession, *, page: int, page_size: int, overdue_first: bool = False, **f) -> dict:
    """Shared by the staff list and the customer portal."""
    agg = await db.execute(
        apply_filters(
            _join(
                select(
                    func.count(),
                    func.coalesce(func.sum(case((Invoice.status != "cancelled", Invoice.total), else_=0)), 0),
                    func.coalesce(
                        func.sum(case((Invoice.status != "cancelled", Invoice.total - Invoice.amount_paid), else_=0)), 0
                    ),
                ).select_from(Invoice)
            ),
            **f,
        )
    )
    total, sum_total, sum_balance = agg.one()
    order = (Invoice.due_date.asc(), Invoice.id.asc()) if overdue_first else (Invoice.id.desc(),)
    rows = await db.execute(
        apply_filters(
            _join(
                select(
                    Invoice.id, Invoice.number, Invoice.status, Invoice.customer_id, User.full_name,
                    User.company, Invoice.subscription_id, Subscription.number.label("sub_number"),
                    Invoice.issue_date, Invoice.due_date, Invoice.period_start, Invoice.period_end,
                    Invoice.total, Invoice.amount_paid, Invoice.sent_at,
                ).select_from(Invoice)
            ),
            **f,
        )
        .order_by(*order)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    today = date.today()
    items = []
    for r in rows:
        balance = r.total - r.amount_paid
        over, days = overdue_info(r.status, r.due_date, balance, today)
        items.append(
            {
                "id": r.id, "number": r.number, "status": r.status, "is_overdue": over,
                "days_overdue": days, "customer_id": r.customer_id, "customer_name": r.full_name,
                "customer_company": r.company, "subscription_id": r.subscription_id,
                "subscription_number": r.sub_number, "issue_date": r.issue_date,
                "due_date": r.due_date, "period_start": r.period_start, "period_end": r.period_end,
                "total": r.total, "amount_paid": r.amount_paid, "balance": balance, "sent_at": r.sent_at,
            }
        )
    return {
        "items": items, "total": total, "page": page, "page_size": page_size,
        "sum_total": sum_total, "sum_balance": sum_balance,
    }


@router.get("", response_model=InvoicePage)
async def list_invoices(
    q: str | None = None,
    status_: str | None = Query(None, alias="status"),
    overdue: bool = False,
    customer_id: int | None = None,
    subscription_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    return await invoice_page(
        db, page=page, page_size=page_size, overdue_first=overdue, status_=status_, overdue=overdue,
        customer_id=customer_id, subscription_id=subscription_id, q=q,
        date_from=date_from, date_to=date_to,
    )


@router.post("/generate", response_model=GenerateOut)
async def generate(
    body: GenerateIn | None = None, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    """Billing day: one draft invoice for every period that is due. Running it twice is harmless."""
    body = body or GenerateIn()
    return await generate_due_invoices(db, body.as_of, body.subscription_ids)


@router.post("/bulk-confirm")
async def bulk_confirm(
    body: BulkConfirmIn | None = None, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    """Confirm many drafts at once (all of them when no ids are given)."""
    ids = body.ids if body else None
    base = [Invoice.status == "draft"] + ([Invoice.id.in_(ids)] if ids else [])
    # a fully discounted invoice has nothing to collect, so it goes straight to paid
    free = await db.execute(update(Invoice).where(*base, Invoice.total <= 0).values(status="paid"))
    res = await db.execute(update(Invoice).where(*base, Invoice.total > 0).values(status="confirmed"))
    await db.commit()
    return {"confirmed": res.rowcount + free.rowcount}


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)):
    return await invoice_out(db, await _load(db, invoice_id))


@router.post("/{invoice_id}/confirm", response_model=InvoiceOut)
async def confirm_invoice(invoice_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)):
    inv = await _load(db, invoice_id)
    if inv.status != "draft":
        raise HTTPException(409, f"A {inv.status} invoice can't be confirmed.")
    inv.status = "confirmed" if inv.total > 0 else "paid"
    await db.commit()
    return await invoice_out(db, inv)


@router.post("/{invoice_id}/cancel", response_model=InvoiceOut)
async def cancel_invoice(invoice_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)):
    inv = await _load(db, invoice_id)
    if inv.status not in ("draft", "confirmed"):
        raise HTTPException(409, f"A {inv.status} invoice can't be cancelled.")
    if inv.amount_paid > 0:
        raise HTTPException(409, "This invoice already has payments recorded, so it can't be cancelled.")
    inv.status = "cancelled"
    await db.commit()
    return await invoice_out(db, inv)


@router.post("/{invoice_id}/send", response_model=InvoiceOut)
async def send_invoice(
    invoice_id: int,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    inv = await _load(db, invoice_id)
    if inv.status == "cancelled":
        raise HTTPException(409, "A cancelled invoice can't be sent.")
    out = await invoice_out(db, inv)
    inv.sent_at = datetime.utcnow()
    await db.commit()
    rows = "".join(
        f"<tr><td>{l.description}</td><td>{l.quantity}</td><td>{l.total}</td></tr>" for l in out.lines
    )
    html = (
        f"<p>Hi {out.customer_name},</p>"
        f"<p>Invoice <b>{out.number}</b> for {out.period_start:%d %b %Y} to {out.period_end:%d %b %Y} "
        f"is ready. Total due: <b>{out.total}</b> by {out.due_date:%d %b %Y}.</p>"
        f"<table>{rows}</table><p>Thank you for being a Brightloop customer.</p>"
    )
    background.add_task(send_email, out.customer_email, f"Invoice {out.number} from Brightloop", html)
    return await invoice_out(db, inv)
