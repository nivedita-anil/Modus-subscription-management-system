from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.discount import Discount
from app.models.user import UserRole
from app.schemas.discount import DiscountIn, DiscountOut

router = APIRouter(prefix="/discounts", tags=["discounts"])

staff_or_admin = require_roles(UserRole.admin, UserRole.staff)
admin_only = require_roles(UserRole.admin)


async def _load(db: AsyncSession, discount_id: int) -> Discount | None:
    return await db.scalar(
        select(Discount).where(Discount.id == discount_id).execution_options(populate_existing=True)
    )


async def _name_taken(db: AsyncSession, name: str, exclude_id: int | None = None) -> bool:
    stmt = select(Discount.id).where(Discount.name.ilike(name))
    if exclude_id is not None:
        stmt = stmt.where(Discount.id != exclude_id)
    return (await db.scalar(stmt)) is not None


@router.get("", response_model=list[DiscountOut])
async def list_discounts(
    q: str | None = Query(None, description="Search by name"),
    active: bool | None = None,
    valid_on: date | None = Query(None, description="Only discounts valid on this date"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    stmt = select(Discount).order_by(Discount.id.desc()).limit(limit).offset(offset)
    if q and q.strip():
        stmt = stmt.where(Discount.name.ilike(f"%{q.strip()}%"))
    if active is not None:
        stmt = stmt.where(Discount.is_active == active)
    if valid_on:
        stmt = stmt.where(
            or_(Discount.start_date.is_(None), Discount.start_date <= valid_on),
            or_(Discount.end_date.is_(None), Discount.end_date >= valid_on),
        )
    return (await db.scalars(stmt)).all()


@router.post("", response_model=DiscountOut, status_code=status.HTTP_201_CREATED)
async def create_discount(
    body: DiscountIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)
):
    data = body.model_dump()
    data["name"] = data["name"].strip()
    if await _name_taken(db, data["name"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "A discount with this name already exists.")
    discount = Discount(**data)
    db.add(discount)
    await db.commit()
    return await _load(db, discount.id)


@router.put("/{discount_id}", response_model=DiscountOut)
async def update_discount(
    discount_id: int,
    body: DiscountIn,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(admin_only),
):
    discount = await _load(db, discount_id)
    if discount is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Discount not found.")
    data = body.model_dump()
    data["name"] = data["name"].strip()
    if await _name_taken(db, data["name"], exclude_id=discount_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A discount with this name already exists.")
    if data["usage_limit"] is not None and data["usage_limit"] < discount.used_count:
        raise HTTPException(
            422,
            f"Usage limit can't be lower than the {discount.used_count} times it has already been used.",
        )
    for key, value in data.items():
        setattr(discount, key, value)
    await db.commit()
    return await _load(db, discount_id)
