from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import auth, discounts, plans, products, quotations, taxes, subscriptions
from app.seed import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_admin()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(plans.router)
app.include_router(taxes.router)
app.include_router(discounts.router)
app.include_router(quotations.router)
app.include_router(subscriptions.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
