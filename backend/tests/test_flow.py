"""End-to-end check of the billing flow. Run:  python -m pytest -q   (from backend/)"""
import os
import tempfile
from datetime import date, timedelta

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/test.db"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_admin  # noqa: E402


TODAY = date.today()


@pytest.fixture(scope="module")
async def client():
    await init_db()
    await seed_admin()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def login(c, email, password):
    r = await c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_full_flow(client):
    c = client
    admin = await login(c, "admin@brightloop.com", "Admin@12345")

    # a customer signs up, staff is created by admin
    r = await c.post("/auth/register", json={"full_name": "Cathy", "email": "cathy@x.com", "password": "Passw0rd!x"})
    assert r.status_code == 201
    cust_id = r.json()["id"]
    r = await c.post("/auth/staff", headers=admin, json={"full_name": "Sam", "email": "sam@x.com", "password": "Passw0rd!x"})
    assert r.status_code == 201
    staff = await login(c, "sam@x.com", "Passw0rd!x")
    cust = await login(c, "cathy@x.com", "Passw0rd!x")

    # catalog
    r = await c.post("/products", headers=admin, json={
        "name": "CRM", "sales_price": 1000, "variants": [{"attribute": "Brand", "value": "Odoo", "extra_price": 560}]})
    assert r.status_code == 201, r.text
    prod = r.json()
    r = await c.post("/plans", headers=admin, json={
        "name": "Monthly", "price": 0, "billing_period": "monthly", "min_quantity": 1,
        "can_pause": True, "can_renew": True, "auto_close": True})
    assert r.status_code == 201, r.text
    plan = r.json()
    tax = (await c.post("/taxes", headers=admin, json={"name": "GST 18%", "rate": 18})).json()
    d10 = (await c.post("/discounts", headers=admin, json={
        "name": "Launch 10%", "discount_type": "percentage", "value": 10, "min_quantity": 2,
        "usage_limit": 2})).json()

    start = TODAY - timedelta(days=75)  # monthly: periods starting day 0, +1 month, +2 months
    body = {
        "customer_id": cust_id, "plan_id": plan["id"], "start_date": str(start),
        "expiry_date": str(TODAY + timedelta(days=300)), "payment_terms": "Net 15",
        "lines": [{"product_id": prod["id"], "variant_id": prod["variants"][0]["id"], "quantity": 2,
                   "tax_id": tax["id"], "discount_id": d10["id"]}],
    }
    # staff creates, walks the lifecycle
    r = await c.post("/subscriptions", headers=staff, json=body)
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["number"].startswith("SUB-") and sub["status"] == "draft"
    # 2 x 1560 = 3120, -10% = 2808, +18% tax = 3313.44
    assert float(sub["total"]) == 3313.44, sub["total"]
    sid = sub["id"]

    r = await c.post(f"/subscriptions/{sid}/transition", headers=staff, json={"to": "active"})
    assert r.status_code == 409  # can't skip steps
    for to in ("quotation", "confirmed", "active"):
        r = await c.post(f"/subscriptions/{sid}/transition", headers=staff, json={"to": to})
        assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"

    # billing day: three periods are due. Run twice: nothing is duplicated.
    r = await c.post("/invoices/generate", headers=staff, json={})
    assert r.status_code == 200, r.text
    first = r.json()
    assert first["created"] == 3 and first["errors"] == []
    r = await c.post("/invoices/generate", headers=staff, json={})
    assert r.json()["created"] == 0
    inv_list = (await c.get(f"/invoices?subscription_id={sid}", headers=staff)).json()
    assert inv_list["total"] == 3

    # discount had 2 uses: periods 1 and 2 discounted, period 3 is not
    ids = sorted(i["id"] for i in inv_list["items"])
    totals = [float((await c.get(f"/invoices/{i}", headers=staff)).json()["total"]) for i in ids]
    assert totals == [3313.44, 3313.44, 3681.6], totals

    # the database itself refuses a second live invoice for a period
    from sqlalchemy.exc import IntegrityError
    from app.database import SessionLocal
    from app.models.invoice import Invoice
    async with SessionLocal() as db:
        existing = await db.get(Invoice, ids[0])
        db.add(Invoice(subscription_id=sid, customer_id=cust_id, period_start=existing.period_start,
                       period_end=existing.period_end, issue_date=TODAY, due_date=TODAY, total=1))
        with pytest.raises(IntegrityError):
            await db.commit()

    # confirm, pay partially, pay the rest
    inv = (await c.get(f"/invoices/{ids[0]}", headers=staff)).json()
    r = await c.post(f"/payments", headers=staff, json={"invoice_id": ids[0], "method": "upi", "amount": 100})
    assert r.status_code == 409  # not confirmed yet
    assert (await c.post(f"/invoices/{ids[0]}/confirm", headers=staff)).status_code == 200
    r = await c.post("/payments", headers=staff, json={"invoice_id": ids[0], "method": "upi", "amount": 1000})
    assert r.status_code == 201, r.text
    r = await c.post("/payments", headers=staff, json={"invoice_id": ids[0], "method": "cash", "amount": 99999})
    assert r.status_code == 409  # overpay refused
    r = await c.post("/payments", headers=staff, json={"invoice_id": ids[0], "method": "card", "amount": 2313.44})
    assert r.status_code == 201
    inv = (await c.get(f"/invoices/{ids[0]}", headers=staff)).json()
    assert inv["status"] == "paid" and float(inv["balance"]) == 0 and len(inv["payments"]) == 2

    # overdue: confirm another one (due date long past)
    assert (await c.post("/invoices/bulk-confirm", headers=staff, json={})).json()["confirmed"] == 2
    od = (await c.get("/invoices?overdue=true", headers=staff)).json()
    assert od["total"] >= 1 and all(i["is_overdue"] for i in od["items"])

    # dashboard
    s = (await c.get("/dashboard/summary?all_time=true", headers=staff)).json()
    assert s["subscriptions"]["active"] == 1
    assert float(s["revenue_collected"]) == 3313.44
    assert s["overdue_count"] >= 1 and float(s["outstanding"]) > 0 and float(s["mrr"]) == 3120.0

    # portal: the customer sees only their own, no drafts, and can't use staff routes
    mine = (await c.get("/portal/subscriptions", headers=cust)).json()
    assert [m["id"] for m in mine] == [sid]
    pinv = (await c.get("/portal/invoices", headers=cust)).json()
    assert pinv["total"] == 3 and all(i["status"] in ("confirmed", "paid") for i in pinv["items"])
    assert (await c.get("/invoices", headers=cust)).status_code == 403
    assert (await c.get("/subscriptions", headers=cust)).status_code == 403
    assert (await c.get("/dashboard/summary", headers=cust)).status_code == 403
    r = await c.post("/auth/register", json={"full_name": "Other", "email": "o@x.com", "password": "Passw0rd!x"})
    other = await login(c, "o@x.com", "Passw0rd!x")
    assert (await c.get(f"/portal/invoices/{ids[0]}", headers=other)).status_code == 404
    assert (await c.get(f"/portal/subscriptions/{sid}", headers=other)).status_code == 404

    # plan flags: customer can pause (plan allows), cannot close early (plan doesn't)
    r = await c.post(f"/portal/subscriptions/{sid}/action", headers=cust, json={"action": "pause"})
    assert r.status_code == 200 and r.json()["is_paused"] is True
    r = await c.post(f"/portal/subscriptions/{sid}/action", headers=cust, json={"action": "close"})
    assert r.status_code == 403
    await c.post(f"/portal/subscriptions/{sid}/action", headers=cust, json={"action": "resume"})

    # staff can't create staff or edit the catalog
    assert (await c.post("/auth/staff", headers=staff, json={"full_name": "X", "email": "x@x.com", "password": "Passw0rd!x"})).status_code == 403
    assert (await c.post("/taxes", headers=staff, json={"name": "Z", "rate": 1})).status_code == 403


async def test_password_reset(client):
    """The emailed link is a signed token: using it sets a new password and works only once."""
    from sqlalchemy import select
    from app.database import SessionLocal
    from app.models.user import User
    from app.security import create_reset_token

    c = client
    await c.post("/auth/register", json={"full_name": "Pat", "email": "pat@x.com", "password": "Passw0rd!x"})
    assert (await c.post("/auth/forgot-password", json={"email": "pat@x.com"})).status_code == 200
    assert (await c.post("/auth/forgot-password", json={"email": "nobody@x.com"})).status_code == 200  # same answer
    async with SessionLocal() as db:
        u = await db.scalar(select(User).where(User.email == "pat@x.com"))
        token = create_reset_token(u.id, u.hashed_password)
    assert (await c.post("/auth/reset-password", json={"token": token, "password": "weak"})).status_code == 422
    assert (await c.post("/auth/reset-password", json={"token": token, "password": "Newpass#123"})).status_code == 200
    assert (await c.post("/auth/reset-password", json={"token": token, "password": "Another#123"})).status_code == 400
    assert (await c.post("/auth/login", json={"email": "pat@x.com", "password": "Newpass#123"})).status_code == 200
    assert (await c.post("/auth/login", json={"email": "pat@x.com", "password": "Passw0rd!x"})).status_code == 401
