"""Turn ORM objects into the response shapes shared by staff routes and the portal."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.invoice import InvoiceOut, PaymentOut
from app.schemas.subscription import SubscriptionOut
from app.services.billing import preview
from app.services.pricing import ZERO
from app.services.subscriptions import TRANSITIONS


def overdue_info(status: str, due: date, balance, today: date | None = None) -> tuple[bool, int]:
    today = today or date.today()
    if status == "confirmed" and balance > 0 and due < today:
        return True, (today - due).days
    return False, 0


async def subscription_out(db: AsyncSession, sub: Subscription, with_invoices: bool = True) -> SubscriptionOut:
    customer = await db.get(User, sub.customer_id)
    calc = preview(sub)
    lines = []
    for r in calc["rows"]:
        ln = r["line"]
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
                "subtotal": r["subtotal"],
                "discount_amount": r["discount_amount"],
                "tax_amount": r["tax_amount"],
                "total": r["total"],
            }
        )
    invoices = []
    if with_invoices:
        rows = await db.scalars(
            select(Invoice)
            .where(Invoice.subscription_id == sub.id)
            .order_by(Invoice.period_start.desc())
            .limit(60)
        )
        invoices = [
            {
                "id": i.id, "number": i.number, "status": i.status,
                "period_start": i.period_start, "period_end": i.period_end,
                "due_date": i.due_date, "total": i.total, "amount_paid": i.amount_paid,
            }
            for i in rows
        ]
    return SubscriptionOut(
        id=sub.id,
        number=sub.number,
        status=sub.status,
        is_paused=sub.is_paused,
        customer_id=sub.customer_id,
        customer_name=customer.full_name,
        customer_email=customer.email,
        customer_company=customer.company,
        plan_id=sub.plan_id,
        plan_name=sub.plan.name,
        billing_period=sub.plan.billing_period,
        plan_can_pause=sub.plan.can_pause,
        plan_can_close_early=sub.plan.can_close_early,
        plan_can_renew=sub.plan.can_renew,
        template_id=sub.template_id,
        discount_id=sub.discount_id,
        discount_name=sub.discount.name if sub.discount else None,
        start_date=sub.start_date,
        expiry_date=sub.expiry_date,
        payment_terms=sub.payment_terms,
        quotation_valid_until=sub.quotation_valid_until,
        next_billing_date=sub.next_billing_date,
        notes=sub.notes,
        created_at=sub.created_at,
        lines=lines,
        subtotal=calc["subtotal"],
        discount_total=calc["discount_total"],
        tax_total=calc["tax_total"],
        total=calc["total"],
        allowed_transitions=TRANSITIONS.get(sub.status, []),
        invoices=invoices,
    )


async def invoice_out(db: AsyncSession, inv: Invoice) -> InvoiceOut:
    customer = await db.get(User, inv.customer_id)
    sub = await db.get(Subscription, inv.subscription_id)
    pays = (
        await db.scalars(select(Payment).where(Payment.invoice_id == inv.id).order_by(Payment.paid_on, Payment.id))
    ).all()
    balance = inv.total - inv.amount_paid
    over, days = overdue_info(inv.status, inv.due_date, balance)
    return InvoiceOut(
        id=inv.id,
        number=inv.number,
        status=inv.status,
        is_overdue=over,
        days_overdue=days,
        customer_id=inv.customer_id,
        customer_name=customer.full_name,
        customer_company=customer.company,
        customer_email=customer.email,
        subscription_id=inv.subscription_id,
        subscription_number=sub.number if sub else None,
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        period_start=inv.period_start,
        period_end=inv.period_end,
        total=inv.total,
        amount_paid=inv.amount_paid,
        balance=balance,
        sent_at=inv.sent_at,
        discount_note=inv.discount_note,
        payment_terms=inv.payment_terms,
        subtotal=inv.subtotal,
        discount_total=inv.discount_total,
        tax_total=inv.tax_total,
        lines=[
            {
                "id": l.id, "description": l.description, "quantity": l.quantity,
                "unit_price": l.unit_price, "subtotal": l.subtotal,
                "discount_amount": l.discount_amount, "tax_name": l.tax_name,
                "tax_rate": l.tax_rate, "tax_amount": l.tax_amount, "total": l.total,
            }
            for l in inv.lines
        ],
        payments=[
            PaymentOut(
                id=p.id, invoice_id=p.invoice_id, invoice_number=inv.number,
                customer_name=customer.full_name, method=p.method, amount=p.amount,
                paid_on=p.paid_on, note=p.note, created_at=p.created_at,
            )
            for p in pays
        ],
    )
