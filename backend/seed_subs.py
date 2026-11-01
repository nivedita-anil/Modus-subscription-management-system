"""Adds quotation templates and sample subscriptions in every status.
Run AFTER seed_demo.py. Safe to run twice: it skips what already exists.

    python seed_subs.py
"""
import asyncio
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

import app.models  # noqa: F401
from app.database import SessionLocal, init_db
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.subscription import Subscription, SubscriptionLine
from app.models.tax import TaxRule
from app.models.user import User
from app.services.pricing import price_line, sum_lines

today = date.today()

# template name, plan, validity days, lines: (product, variant value, qty, price, tax, discount)
TEMPLATES = [
    ("Business CRM Starter", "Business Monthly", 30, [
        ("Brightloop CRM", "Standard", 5, 1000, "GST 18%", "Launch 10%"),
        ("Priority Support", None, 1, 499, "GST 18%", None),
    ]),
    ("Yearly Enterprise", "Business Yearly", 45, [
        ("Brightloop CRM", "Odoo", 10, 1560, "GST 18%", "Bulk 15%"),
        ("Analytics Add-on", None, 10, 299, "GST 18%", None),
    ]),
]

# customer, plan, status, start offset, expiry offset, terms, lines
SUBS = [
    ("rahul@example.com", "Business Monthly", "active", -40, 324, "net_15", [
        ("Brightloop CRM", "Standard", 5, 1000, "GST 18%", "Launch 10%"),
        ("Priority Support", None, 1, 499, "GST 18%", None)]),
    ("meera@example.com", "Business Yearly", "confirmed", -10, 354, "net_30", [
        ("Brightloop CRM", "Odoo", 10, 1560, "GST 18%", "Bulk 15%"),
        ("Analytics Add-on", None, 10, 299, "GST 18%", None)]),
    ("arjun@example.com", "Starter Monthly", "draft", 0, 364, "immediate", [
        ("Analytics Add-on", None, 2, 299, "GST 5%", None)]),
    ("rahul@example.com", "Weekly Trial", "closed", -60, -30, "net_15", [
        ("Priority Support", None, 1, 499, "GST 18%", None)]),
    ("meera@example.com", "Starter Monthly", "quotation", 0, 364, "net_30", [
        ("Brightloop CRM", "Standard", 2, 1000, "GST 18%", "Launch 10%")]),
]


async def main() -> None:
    await init_db()
    async with SessionLocal() as db:
        async def one(model, **where):
            return await db.scalar(select(model).filter_by(**where))

        async def resolve(spec):
            pname, vvalue, qty, price, tname, dname = spec
            product = await one(Product, name=pname)
            if product is None:
                raise SystemExit(f"Product '{pname}' not found. Run seed_demo.py first.")
            variant = None
            if vvalue:
                variant = await db.scalar(
                    select(ProductVariant).where(
                        ProductVariant.product_id == product.id, ProductVariant.value == vvalue
                    )
                )
            tax = await one(TaxRule, name=tname) if tname else None
            disc = await one(Discount, name=dname) if dname else None
            return product, variant, qty, Decimal(price), tax, disc

        for name, plan_name, days, lines in TEMPLATES:
            if await one(QuotationTemplate, name=name):
                continue
            plan = await one(Plan, name=plan_name)
            if plan is None:
                raise SystemExit(f"Plan '{plan_name}' not found. Run seed_demo.py first.")
            built = []
            for spec in lines:
                product, variant, qty, price, tax, disc = await resolve(spec)
                built.append(QuotationTemplateLine(
                    product_id=product.id, variant_id=variant.id if variant else None,
                    quantity=qty, unit_price=price,
                    tax_id=tax.id if tax else None, discount_id=disc.id if disc else None))
            db.add(QuotationTemplate(name=name, plan_id=plan.id, validity_days=days,
                                     notes="Demo template", lines=built))
        await db.flush()

        if await db.scalar(select(Subscription.id).limit(1)):
            await db.commit()
            print("Templates ready. Subscriptions already exist, so none were added.")
            return

        for email, plan_name, st, start_off, exp_off, terms, lines in SUBS:
            customer = await one(User, email=email)
            plan = await one(Plan, name=plan_name)
            if customer is None or plan is None:
                raise SystemExit("Demo customers or plans are missing. Run seed_demo.py first.")
            start, expiry = today + timedelta(days=start_off), today + timedelta(days=exp_off)
            rows, priced = [], []
            for spec in lines:
                product, variant, qty, price, tax, disc = await resolve(spec)
                p = price_line(qty, price, discount=disc, tax=tax, on=today)
                priced.append(p)
                rows.append(SubscriptionLine(
                    product_id=product.id, variant_id=variant.id if variant else None,
                    quantity=qty, unit_price=price,
                    tax_id=tax.id if tax else None, discount_id=disc.id if disc else None,
                    subtotal=p["subtotal"], discount_amount=p["discount_amount"],
                    tax_amount=p["tax_amount"], total=p["total"]))
            sub = Subscription(
                status=st, customer_id=customer.id, plan_id=plan.id,
                start_date=start, expiry_date=expiry, payment_terms=terms,
                next_billing_date=start if st == "active" else None,
                quote_valid_until=today + timedelta(days=30) if st in ("draft", "quotation") else None,
                **sum_lines(priced))
            sub.lines = rows
            db.add(sub)
            await db.flush()
            sub.number = f"SUB-{sub.id:05d}"
        await db.commit()

        # count discount uses for the confirmed / active samples
        subs = (await db.scalars(select(Subscription).where(Subscription.status.in_(["confirmed", "active"])))).all()
        for s in subs:
            for d in {l.discount_id: l.discount for l in s.lines if l.discount_id and l.discount_amount > 0}.values():
                d.used_count += 1
        await db.commit()
    print("Templates and 5 sample subscriptions ready (draft, quotation, confirmed, active, closed).")


if __name__ == "__main__":
    asyncio.run(main())
