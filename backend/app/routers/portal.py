"""Customer portal: a customer only ever sees and touches their own records."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.invoice import Invoice
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.routers.invoices import invoice_page
from app.schemas.invoice import InvoiceOut, InvoicePage
from app.schemas.subscription import ActionIn, SubscriptionOut
from app.services.serializers import invoice_out, subscription_out
from app.services.subscriptions import run_action, transition

router = APIRouter(prefix="/portal", tags=["customer portal"])
customer_only = require_roles(UserRole.customer)

VISIBLE_INVOICES = ("confirmed", "paid")  # drafts and cancelled invoices stay internal


async def _own_sub(db: AsyncSession, sub_id: int, me: User) -> Subscription:
    sub = await db.scalar(
        select(Subscription)
        .where(Subscription.id == sub_id, Subscription.customer_id == me.id, Subscription.status != "draft")
        .execution_options(populate_existing=True)
    )
    if sub is None:
        raise HTTPException(404, "Subscription not found.")
    return sub


async def _out(db: AsyncSession, sub: Subscription) -> SubscriptionOut:
    out = await subscription_out(db, sub)
    out.invoices = [i for i in out.invoices if i.status in VISIBLE_INVOICES]
    return out


@router.get("/subscriptions", response_model=list[SubscriptionOut])
async def my_subscriptions(db: AsyncSession = Depends(get_db), me: User = Depends(customer_only)):
    subs = (
        await db.scalars(
            select(Subscription)
            .where(Subscription.customer_id == me.id, Subscription.status != "draft")
            .order_by(Subscription.id.desc())
            .limit(200)
        )
    ).all()
    return [await subscription_out(db, s, with_invoices=False) for s in subs]


@router.get("/subscriptions/{sub_id}", response_model=SubscriptionOut)
async def my_subscription(sub_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(customer_only)):
    return await _out(db, await _own_sub(db, sub_id, me))


@router.post("/subscriptions/{sub_id}/accept", response_model=SubscriptionOut)
async def accept_quotation(sub_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(customer_only)):
    """The customer says yes to a quotation they were sent."""
    sub = await _own_sub(db, sub_id, me)
    if sub.status != "quotation":
        raise HTTPException(409, "Only a quotation can be accepted.")
    await transition(db, sub, "confirmed")
    return await _out(db, await _own_sub(db, sub_id, me))


@router.post("/subscriptions/{sub_id}/action", response_model=SubscriptionOut)
async def my_subscription_action(
    sub_id: int, body: ActionIn, db: AsyncSession = Depends(get_db), me: User = Depends(customer_only)
):
    """Pause, resume, close early or renew. The plan decides what a customer may do."""
    sub = await _own_sub(db, sub_id, me)
    await run_action(db, sub, body.action, me.role)
    return await _out(db, await _own_sub(db, sub_id, me))


@router.get("/invoices", response_model=InvoicePage)
async def my_invoices(
    status_: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(customer_only),
):
    wanted = [status_] if status_ in VISIBLE_INVOICES else list(VISIBLE_INVOICES)
    return await invoice_page(
        db, page=page, page_size=page_size, status_=None, statuses=wanted, overdue=False,
        customer_id=me.id, subscription_id=None, q=None, date_from=None, date_to=None,
    )


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def my_invoice(invoice_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(customer_only)):
    inv = await db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.customer_id == me.id, Invoice.status.in_(VISIBLE_INVOICES))
        .execution_options(populate_existing=True)
    )
    if inv is None:
        raise HTTPException(404, "Invoice not found.")
    return await invoice_out(db, inv)
