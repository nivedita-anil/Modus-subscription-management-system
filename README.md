# Brightloop

A subscription management system for businesses that sell recurring products and services. It covers the billing lifecycle (quotations, subscriptions, invoices, payments, overdue follow-up) with separate interfaces for customers, staff, and admins.

Built for a hackathon. FastAPI backend, React frontend.

## Status

Feature complete for the hackathon brief. The billing flow is covered by an automated test (`backend/tests`), and every page answers in well under 100 ms on 3,000 subscriptions and about 5,000 invoices.

| Feature | State |
| --- | --- |
| Auth: register, login, JWT, role guards, password reset by email link | Done |
| Roles: admin, staff, customer portal. Only an admin can add staff | Done |
| Products and variants, plans, tax rules, discounts | Done |
| Quotation templates | Done |
| Subscriptions: Draft, Quotation, Confirmed, Active, Closed. Pause, renew, close early (per plan) | Done |
| Invoices created from subscriptions, with tax and discounts. Confirm, cancel, send, print | Done |
| No double billing: the database allows one live invoice per subscription and period | Done |
| Payments recorded against invoices, paid and outstanding tracking, overdue list | Done |
| Customer portal: own subscriptions and invoices, accept quotes, pause, renew | Done |
| Finance dashboard with filters and summary | Done |
| Daily automation: bills what is due, closes plans that end on their own | Done |

## Target scope

**Customer portal**
- Sign up, log in, reset password
- View subscriptions
- View and download invoices

**Staff**
- Quotation templates
- Subscription list with the lifecycle `Draft → Quotation → Confirmed → Active → Closed`
- Invoices, recording payments, chasing overdue ones

**Admin**
- Products and variants
- Plans
- Tax rules and discounts
- Staff management
- Finance dashboard

## Tech stack

- **Backend:** Python, FastAPI, async SQLAlchemy, SQLite, Pydantic
- **Frontend:** React, Vite, Tailwind CSS, lucide-react icons

## Project structure

```
.
├── backend/
│   └── app/
│       ├── main.py          App setup, CORS, router registration
│       ├── config.py        Settings
│       ├── database.py      Engine, session, init_db
│       ├── deps.py          Auth dependencies and role guards
│       ├── seed.py          Creates the default admin on startup
│       ├── seed_demo.py     Demo data (python -m app.seed_demo)
│       ├── scheduler.py     Daily billing job
│       ├── models/          user, product, plan, tax, discount, quotation, subscription, invoice, payment
│       ├── schemas/         request and response shapes
│       ├── services/        billing (invoice engine), pricing, subscription rules
│       └── routers/         auth, catalog, subscriptions, invoices, payments, dashboard, portal
│   └── tests/               end-to-end billing test
└── frontend/
    └── src/
        ├── App.jsx          Routes
        ├── api/client.js    API client
        ├── lib/             auth.js, format.js
        ├── components/      AuthShell, RequireRole, layouts/AdminLayout
        └── pages/
            ├── auth/        Login, Register
            ├── admin/       Products, Plans, Discounts, Tax rules, Staff
            ├── shared/      Dashboard, Subscriptions, Invoices, Payments (admin and staff)
            └── portal/      Customer screens
```

## Getting started

### Requirements

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`.

- Health check: `http://localhost:8000/health`
- Swagger docs: `http://localhost:8000/docs`

On startup the app creates any missing tables in `brightloop.db` and seeds the admin account.

### Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The app runs at `http://localhost:5173` and redirects to `/login`. The backend must be running.

### Default admin login

```
admin@brightloop.com
Admin@12345
```

This account is for local development only. Change the password before deploying anywhere.

## Roles and access

| Role | Access |
| --- | --- |
| Admin | Everything, including creating and editing products and plans |
| Staff | Read access to products and plans, plus the staff screens as they are built |
| Customer | Customer portal only |

Admin pages are wrapped in a role guard on the frontend, and every write endpoint checks the role on the backend.

## Password rules

Registration requires:

- More than 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one special character

## API overview

| Prefix | Purpose |
| --- | --- |
| `/auth` | Register, login, token refresh |
| `/products` | Product and variant management |
| `/plans` | Plan management. List supports search, billing period, active flag, and `available_on` date filters |

See `/docs` for the full list with request and response shapes.

## Roadmap

1. Tax rules and discounts
2. Quotation templates
3. Subscriptions and the status lifecycle
4. Invoices and payments
5. Overdue handling
6. Customer portal
7. Finance dashboard

## Notes

- `brightloop.db`, `.env`, and `node_modules` must not be committed. Check `git status` before every push.
- The Swagger page is a developer tool. The product interface is the React app.

### Demo data

An empty database shows empty screens. To fill it with products, plans, customers, about 3,000 subscriptions, invoices and payments (takes about 20 seconds):

```bash
cd backend
python -m app.seed_demo            # or --subs 200 for a smaller set
```

Extra logins it creates (local use only):

```
staff@brightloop.com      Staff@12345
customer@brightloop.com   Customer@12345
```

### Billing day

Open **Invoices** and click **Generate due invoices**. Every active subscription whose next period has started gets a draft invoice with its lines, discounts and tax filled in. Clicking again creates nothing new. **Confirm all drafts** confirms them in one go. The same job also runs by itself every night.

### Tests

```bash
cd backend
pip install pytest pytest-asyncio
python -m pytest -q
```
