# Brightloop

A subscription management system for businesses that sell recurring products and services. It covers the full billing lifecycle: quotations, subscriptions, invoices, payments, and overdue follow-up, with separate interfaces for customers, staff, and admins.

Built for a hackathon. The backend is FastAPI and the frontend is React.

## Status

Work in progress. Here is what exists today and what doesn't.

| Area | State |
| --- | --- |
| Backend foundation (config, database, health check) | Done |
| `users` table with unique email and role column | Done |
| Frontend scaffold (Vite, React, Tailwind) | Done |
| Login and register pages (UI and validation) | Done |
| Auth endpoints (register, login, roles) | Next |
| Products, variants, plans | Planned |
| Subscriptions and quotation templates | Planned |
| Invoices, payments, overdue handling | Planned |
| Tax rules, discounts, finance dashboard | Planned |

The login and register forms render and validate, but submitting them will show an error until the auth endpoints are built.

## Features (target scope)

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

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite
- **Frontend:** React, Vite, Tailwind CSS

## Project structure

```
.
├── backend/                 FastAPI app and SQLite database
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/client.js            API client
        ├── components/AuthShell.jsx  Shared layout for auth pages
        └── pages/auth/
            ├── Login.jsx
            └── Register.jsx
```

## Getting started

### Requirements

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000`.

- Health check: `http://localhost:8000/health`
- Interactive API docs (Swagger): `http://localhost:8000/docs`

The SQLite database (`brightloop.db`) is created in `backend/` on first run.

### Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The app runs at `http://localhost:5173` and redirects to `/login`. Make sure the backend is running, otherwise the forms will report that they can't reach the server.

## Password rules

Registration enforces the following, and the same rules will be enforced server-side:

- More than 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one special character

## Roadmap

1. Backend auth: register, login, role guards
2. Wire the login and register pages to the API
3. Products, variants, and plans
4. Subscriptions and quotation templates
5. Invoices and payments
6. Overdue handling, tax rules, discounts
7. Finance dashboard

Each step is built backend and frontend together so every feature can be clicked through.

## Notes

- `brightloop.db` and `.env` should not be committed. Check `.gitignore` before pushing.
- The Swagger page at `/docs` is a developer tool for testing endpoints. It is not the product interface.
