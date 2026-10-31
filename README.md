# Brightloop

A subscription management system for businesses that sell recurring products and services. It covers the billing lifecycle (quotations, subscriptions, invoices, payments, overdue follow-up) with separate interfaces for customers, staff, and admins.

Built for a hackathon. FastAPI backend, React frontend.

## Status

Work in progress. Features are built backend and frontend together, one at a time.

| Feature | State |
| --- | --- |
| Backend foundation (config, async database, health check) | Done |
| Auth: register, login, JWT access and refresh tokens, role guards | Done |
| Seeded admin account | Done |
| Frontend scaffold, login and register pages | Done |
| Admin layout with role-protected routes | Done |
| Products and variants | Done |
| Plans (price, billing period, availability, lifecycle options) | Done |
| Tax rules and discounts | Next |
| Quotation templates and subscriptions | Planned |
| Invoices, payments, overdue handling | Planned |
| Customer portal | Planned |
| Finance dashboard | Planned |
| Password reset | Planned |

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
│       ├── models/          user, product, plan
│       ├── schemas/         auth, product, plan
│       └── routers/         auth, products, plans
└── frontend/
    └── src/
        ├── App.jsx          Routes
        ├── api/client.js    API client
        ├── lib/             auth.js, format.js
        ├── components/      AuthShell, RequireRole, layouts/AdminLayout
        └── pages/
            ├── auth/        Login, Register
            └── admin/       Products, Plans
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
