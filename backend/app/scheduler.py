"""Daily automation: bill whatever is due and close plans that end on their own."""
import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import SessionLocal
from app.services.billing import generate_due_invoices

log = logging.getLogger("scheduler")
scheduler = AsyncIOScheduler()


async def daily_billing() -> None:
    async with SessionLocal() as db:
        result = await generate_due_invoices(db, date.today())
    log.info("daily billing: %s invoices created, %s closed", result["created"], result["closed"])
    print(f"[scheduler] daily billing: {result['created']} invoices created, {result['closed']} closed")


def start() -> None:
    scheduler.add_job(daily_billing, "cron", hour=0, minute=5, id="daily_billing", replace_existing=True)
    scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
