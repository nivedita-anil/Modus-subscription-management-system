"""Fill the database with sample data so every screen has something to show.
Safe to run more than once: anything that already exists is skipped.

Run from the backend folder:  python seed_demo.py
"""
import asyncio
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

import app.models  # noqa: F401  (registers every table)
from app.database import SessionLocal, init_db
from app.models.discount import Discount
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.tax import TaxRule
from app.models.user import User, UserRole
from app.security import hash_password

STAFF_PASSWORD = "Staff@12345"
CUSTOMER_PASSWORD = "Customer@123"

USERS = [
    ("staff@brightloop.com", "Sam Staff", None, UserRole.staff, STAFF_PASSWORD),
    ("rahul@example.com", "Rahul Menon", "Acme Retail", UserRole.customer, CUSTOMER_PASSWORD),
    ("meera@example.com", "Meera Nair", "Northwind Traders", UserRole.customer, CUSTOMER_PASSWORD),
    ("arjun@example.com", "Arjun Pillai", "Globex Labs", UserRole.customer, CUSTOMER_PASSWORD),
]

# name, type, sales, cost, notes, variants[(attribute, value, extra)]
PRODUCTS = [
    ("Brightloop CRM", "software", 1000, 400, "Core CRM seat licence",
     [("Brand", "Odoo", 560), ("Brand", "Standard", 0)]),
    ("Analytics Add-on", "add_on", 299, 80, "Dashboards and exports", []),
    ("Priority Support", "service", 499, 150, "24x7 support with 4h response", []),
    ("Extra Seats Pack", "add_on", 150, 30, "Per extra seat", []),
]

today = date.today()
# name, price, period, min_qty, from, to, auto_close, close_early, pause, renew
PLANS = [
    ("Starter Monthly", 499, "monthly", 1, None, None, False, False, True, True),
    ("Business Monthly", 999, "monthly", 5, None, None, False, True, True, True),
    ("Business Yearly", 9990, "yearly", 5, today - timedelta(days=30), today + timedelta(days=365), True, False, False, True),
    ("Weekly Trial", 99, "weekly", 1, None, today + timedelta(days=60), True, False, False, False),
    ("Daily Pass", 19, "daily", 1, None, None, True, False, False, False),
]

TAXES = [("GST 18%", 18, "Standard rate for software"), ("GST 5%", 5, "Reduced rate")]

# name, type, value, min_purchase, min_quantity, start, end, usage_limit
DISCOUNTS = [
    ("Launch 10%", "percentage", 10, 0, 2, None, today + timedelta(days=60), 100),
    ("Loyalty 500 off", "fixed", 500, 5000, 1, None, None, 20),
    ("Bulk 15%", "percentage", 15, 0, 10, None, None, None),
]


async def main() -> None:
    await init_db()
    async with SessionLocal() as db:
        for email, name, company, role, pw in USERS:
            if not await db.scalar(select(User.id).where(User.email == email)):
                db.add(User(email=email, full_name=name, company=company,
                            hashed_password=hash_password(pw), role=role))

        for name, ptype, sales, cost, notes, variants in PRODUCTS:
            if not await db.scalar(select(Product.id).where(Product.name == name)):
                db.add(Product(
                    name=name, product_type=ptype, sales_price=Decimal(sales),
                    cost_price=Decimal(cost), notes=notes,
                    variants=[ProductVariant(attribute=a, value=v, extra_price=Decimal(x))
                              for a, v, x in variants],
                ))

        for name, price, period, minq, dfrom, dto, auto, early, pause, renew in PLANS:
            if not await db.scalar(select(Plan.id).where(Plan.name == name)):
                db.add(Plan(name=name, price=Decimal(price), billing_period=period,
                            min_quantity=minq, available_from=dfrom, available_to=dto,
                            auto_close=auto, can_close_early=early, can_pause=pause, can_renew=renew))

        for name, rate, desc in TAXES:
            if not await db.scalar(select(TaxRule.id).where(TaxRule.name == name)):
                db.add(TaxRule(name=name, rate=Decimal(rate), description=desc))

        for name, dtype, value, min_purchase, min_qty, start, end, limit in DISCOUNTS:
            if not await db.scalar(select(Discount.id).where(Discount.name == name)):
                db.add(Discount(name=name, discount_type=dtype, value=Decimal(value),
                                min_purchase=Decimal(min_purchase), min_quantity=min_qty,
                                start_date=start, end_date=end, usage_limit=limit))

        await db.commit()

    print("Demo data ready.\n")
    print("  Admin     admin@brightloop.com   Admin@12345")
    print(f"  Staff     staff@brightloop.com   {STAFF_PASSWORD}")
    print(f"  Customers rahul@ / meera@ / arjun@example.com   {CUSTOMER_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
