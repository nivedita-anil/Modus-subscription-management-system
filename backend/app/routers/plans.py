from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.plan import Plan
from app.models.user import UserRole
from app.schemas.plan import PlanIn, PlanOut

router = APIRouter(prefix="/plans", tags=["plans"])

staff_or_admin = require_roles(UserRole.admin, UserRole.staff)
admin_only = require_roles(UserRole.admin)


async def _load(db: AsyncSession, plan_id: int) -> Plan | None:
    return await db.scalar(
        select(Plan).where(Plan.id == plan_id).execution_options(populate_existing=True)
    )


@router.get("", response_model=list[PlanOut])
async def list_plans(
    q: str | None = Query(None, description="Search by name"),
    billing_period: str | None = None,
    active: bool | None = None,
    available_on: date | None = Query(None, description="Only plans open for sale on this date"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    stmt = select(Plan).order_by(Plan.id.desc()).limit(limit).offset(offset)
    if q and q.strip():
        stmt = stmt.where(Plan.name.ilike(f"%{q.strip()}%"))
    if billing_period:
        stmt = stmt.where(Plan.billing_period == billing_period)
    if active is not None:
        stmt = stmt.where(Plan.is_active == active)
    if available_on:
        stmt = stmt.where(
            or_(Plan.available_from.is_(None), Plan.available_from <= available_on),
            or_(Plan.available_to.is_(None), Plan.available_to >= available_on),
        )
    return (await db.scalars(stmt)).all()


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan(plan_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)):
    plan = await _load(db, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    return plan


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(body: PlanIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)):
    data = body.model_dump()
    data["name"] = data["name"].strip()
    plan = Plan(**data)
    db.add(plan)
    await db.commit()
    return await _load(db, plan.id)


@router.put("/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: int, body: PlanIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)
):
    plan = await _load(db, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    for key, value in body.model_dump().items():
        setattr(plan, key, value.strip() if key == "name" else value)
    await db.commit()
    return await _load(db, plan_id)
