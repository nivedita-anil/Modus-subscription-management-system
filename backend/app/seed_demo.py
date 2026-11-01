"""Fill the database with believable demo data so every screen has something to show.

    cd backend && python -m app.seed_demo            # about 3,000 subscriptions
    python -m app.seed_demo --subs 200               # a smaller set

Logins it creates (local development only):
    staff@brightloop.com     Staff@12345
    customer@brightloop.com  Customer@12345   (and ~120 more customers, same password)
Safe to run once; it stops if the demo data is already there.
"""
import argparse
import asyncio
import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import bindparam, func, insert, select, update

from app.database import SessionLocal, init_db
from app.models.discount import Discount
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.plan import Plan
from app.models.product import Product, ProductVariant
from app.models.quotation import QuotationTemplate, QuotationTemplateLine
from app.models.subscription import TERMS, Subscription, SubscriptionLine
from app.models.tax import TaxRule
from app.models.user import User, UserRole
from app.security import hash_password
from app.seed import seed_admin
from app.services.billing import generate_due_invoices
from app.services.pricing import money

FIRST = ["Aarav", "Diya", "Rohan", "Meera", "Kabir", "Anaya", "Vihaan", "Isha", "Arjun", "Sara",
         "Nikhil", "Priya", "Rahul", "Neha", "Karthik", "Lakshmi", "Faisal", "Anjali", "Varun", "Tara"]
LAST = ["Nair", "Menon", "Pillai", "Kumar", "Sharma", "Iyer", "Thomas", "George", "Varma", "Das",
        "Reddy", "Mathew", "Joseph", "Krishnan", "Shah", "Patel", "Singh", "Bose", "Rao", "Khan"]
BIZ = ["Labs", "Traders", "Studio", "Foods", "Logistics", "Retail", "Systems", "Clinic", "Works", "Mart"]


async def main(n_subs: int) -> None:
    random.seed(7)
    today = date.today()
    await init_db()
    await seed_admin()

    async with SessionLocal() as db:
        if await db.scalar(select(User.id).where(User.email == "customer@brightloop.com")):
            print("Demo data is already there. Delete brightloop.db to start over.")
            return

        # ---- people (one password hash reused: bcrypt is slow on purpose)
        staff_pw, cust_pw = hash_password("Staff@12345"), hash_password("Customer@12345")
        db.add(User(email="staff@brightloop.com", full_name="Sam Staff", hashed_password=staff_pw, role=UserRole.staff))
        customers = [User(email="customer@brightloop.com", full_name="Demo Customer", company="Demo Co",
                          hashed_password=cust_pw, role=UserRole.customer)]
        for i in range(120):
            f, l = random.choice(FIRST), random.choice(LAST)
            customers.append(User(
                email=f"{f}.{l}{i}@example.com".lower(), full_name=f"{f} {l}",
                company=f"{l} {random.choice(BIZ)}", hashed_password=cust_pw, role=UserRole.customer))
        db.add_all(customers)

        # ---- catalog
        def product(name, kind, price, variants=()):
            p = Product(name=name, product_type=kind, sales_price=price, cost_price=Decimal(price) * Decimal("0.4"))
            p.variants = [ProductVariant(attribute=a, value=v, extra_price=x) for a, v, x in variants]
            return p

        crm = product("Brightloop CRM", "software", 1200, [("Brand", "Odoo", 560), ("Brand", "Custom", 900)])
        helpdesk = product("Brightloop Helpdesk", "software", 800, [("Tier", "Standard", 0), ("Tier", "Pro", 400)])
        analytics = product("Brightloop Analytics", "software", 1500)
        seat = product("Extra Seat", "add_on", 150)
        storage = product("Storage Pack 100GB", "add_on", 300)
        onboarding = product("Onboarding Support", "service", 2500)
        products = [crm, helpdesk, analytics, seat, storage, onboarding]
        db.add_all(products)

        monthly = Plan(name="Monthly Standard", price=999, billing_period="monthly",
                       can_pause=True, can_renew=True, can_close_early=True)
        yearly = Plan(name="Yearly Business", price=9999, billing_period="yearly", auto_close=True, can_renew=True)
        weekly = Plan(name="Weekly Starter", price=299, billing_period="weekly", auto_close=True)
        flex = Plan(name="Monthly Flex", price=1299, billing_period="monthly",
                    can_pause=True, can_renew=True, can_close_early=True, auto_close=True)
        plans = [monthly, yearly, weekly, flex]
        db.add_all(plans)

        gst18, gst5 = TaxRule(name="GST 18%", rate=18), TaxRule(name="GST 5%", rate=5)
        launch = Discount(name="Launch 10%", discount_type="percentage", value=10, min_quantity=2)
        bulk = Discount(name="Bulk 15%", discount_type="percentage", value=15, min_quantity=8, usage_limit=400)
        flat = Discount(name="Flat 500 off", discount_type="fixed", value=500, min_purchase=5000)
        summer = Discount(name="Summer Sale 20%", discount_type="percentage", value=20,
                          start_date=today - timedelta(days=120), end_date=today - timedelta(days=40))
        db.add_all([gst18, gst5, launch, bulk, flat, summer])
        await db.flush()

        odoo_variant = crm.variants[0]
        db.add_all([
            QuotationTemplate(name="Starter CRM Pack", plan_id=monthly.id, validity_days=14, lines=[
                QuotationTemplateLine(product_id=crm.id, variant_id=odoo_variant.id, quantity=1,
                                      unit_price=1760, tax_id=gst18.id),
                QuotationTemplateLine(product_id=seat.id, quantity=5, unit_price=150,
                                      tax_id=gst18.id, discount_id=launch.id)]),
            QuotationTemplate(name="Business Suite (yearly)", plan_id=yearly.id, validity_days=30, lines=[
                QuotationTemplateLine(product_id=crm.id, quantity=1, unit_price=1200, tax_id=gst18.id),
                QuotationTemplateLine(product_id=helpdesk.id, quantity=1, unit_price=800, tax_id=gst18.id),
                QuotationTemplateLine(product_id=analytics.id, quantity=1, unit_price=1500, tax_id=gst18.id)]),
            QuotationTemplate(name="Weekly Trial", plan_id=weekly.id, validity_days=7, lines=[
                QuotationTemplateLine(product_id=storage.id, quantity=2, unit_price=300, tax_id=gst5.id)]),
        ])
        await db.commit()

        # ---- subscriptions
        cust_ids = (await db.scalars(select(User.id).where(User.role == UserRole.customer))).all()
        by_plan = {"monthly": (monthly, flex), "yearly": (yearly,), "weekly": (weekly,)}

        def pick_status():
            r = random.random()
            return ("active" if r < .86 else "closed" if r < .91 else "confirmed" if r < .94
                    else "quotation" if r < .97 else "draft")

        batch: list[Subscription] = []
        for i in range(n_subs):
            r = random.random()
            kind = "monthly" if r < .62 else "yearly" if r < .84 else "weekly"
            plan = random.choice(by_plan[kind])
            back = {"monthly": 95, "yearly": 300, "weekly": 28}[kind]
            start = today - timedelta(days=random.randint(0, back))
            term = {"monthly": 365, "yearly": 730, "weekly": 120}[kind]
            lines = []
            for p in random.sample(products, random.randint(1, 3)):
                variant = random.choice(p.variants) if p.variants and random.random() < .5 else None
                qty = random.choice([1, 1, 2, 3, 5, 8, 10])
                price = Decimal(p.sales_price) + (Decimal(variant.extra_price) if variant else 0)
                disc = None
                if random.random() < .3:
                    disc = next((d for d in (bulk, launch) if qty >= d.min_quantity), None)
                lines.append(SubscriptionLine(
                    product_id=p.id, variant_id=variant.id if variant else None, quantity=qty,
                    unit_price=money(price), tax_id=random.choice([gst18, gst18, gst18, gst5]).id,
                    discount_id=disc.id if disc else None))
            status = pick_status()
            sub = Subscription(
                customer_id=random.choice(cust_ids), plan_id=plan.id, status=status,
                start_date=start, expiry_date=start + timedelta(days=term),
                payment_terms=random.choice(TERMS), lines=lines,
            )
            if random.random() < .08:
                sub.discount_id = flat.id
            if status == "active":
                sub.next_billing_date = start
            if status == "quotation":
                sub.quotation_valid_until = today + timedelta(days=random.randint(3, 20))
            if status == "closed":
                sub.next_billing_date = None
            batch.append(sub)
            if len(batch) == 500 or i == n_subs - 1:
                db.add_all(batch)
                await db.flush()
                for s in batch:
                    s.number = f"SUB-{s.id:06d}"
                await db.commit()
                batch = []
        print(f"Created {n_subs} subscriptions.")

        # ---- billing run, exactly what the staff button does
        res = await generate_due_invoices(db, today)
        print(f"Billing run: {res['created']} invoices created for {res['subscriptions']} subscriptions.")

        # ---- most invoices confirmed, most of those paid; some partial; the rest overdue
        rows = (await db.execute(select(Invoice.id, Invoice.total, Invoice.issue_date, Invoice.due_date))).all()
        updates, payments = [], []
        for inv_id, total, issued, due in rows:
            total = Decimal(total)
            if issued >= today - timedelta(days=3):
                continue  # fresh ones stay drafts, ready for "confirm all"
            paid, status = Decimal(0), "confirmed"
            r = random.random()
            if total <= 0:
                status = "paid"
            elif r < .68:
                paid, status = total, "paid"
            elif r < .78:
                paid = money(total * Decimal(random.choice(["0.3", "0.5", "0.7"])))
            if paid > 0:
                pay_date = min(today, issued + timedelta(days=random.randint(0, max(1, (due - issued).days + 10))))
                payments.append({
                    "invoice_id": inv_id, "method": random.choice(["bank_transfer", "card", "upi", "cash", "cheque"]),
                    "amount": paid, "paid_on": pay_date, "note": None})
            updates.append({"b_id": inv_id, "b_status": status, "b_paid": paid})
        for i in range(0, len(updates), 1000):
            t = Invoice.__table__  # plain table update, so no ORM bulk-by-primary-key rules apply
            await db.execute(
                update(t).where(t.c.id == bindparam("b_id"))
                .values(status=bindparam("b_status"), amount_paid=bindparam("b_paid")),
                updates[i:i + 1000])
        for i in range(0, len(payments), 1000):
            await db.execute(insert(Payment.__table__), payments[i:i + 1000])
        await db.commit()
        n_inv = await db.scalar(select(func.count()).select_from(Invoice))
        print(f"{n_inv} invoices, {len(payments)} payments. Done.")
        print("Log in as admin@brightloop.com / Admin@12345, staff@brightloop.com / Staff@12345,")
        print("or customer@brightloop.com / Customer@12345")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--subs", type=int, default=3000)
    asyncio.run(main(ap.parse_args().subs))
