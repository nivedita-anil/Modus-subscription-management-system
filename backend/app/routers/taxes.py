from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.tax import TaxRule
from app.models.user import UserRole
from app.schemas.tax import TaxIn, TaxOut

router = APIRouter(prefix="/taxes", tags=["taxes"])

staff_or_admin = require_roles(UserRole.admin, UserRole.staff)
admin_only = require_roles(UserRole.admin)


async def _load(db: AsyncSession, tax_id: int) -> TaxRule | None:
    return await db.scalar(
        select(TaxRule).where(TaxRule.id == tax_id).execution_options(populate_existing=True)
    )


async def _name_taken(db: AsyncSession, name: str, exclude_id: int | None = None) -> bool:
    stmt = select(TaxRule.id).where(TaxRule.name.ilike(name))
    if exclude_id is not None:
        stmt = stmt.where(TaxRule.id != exclude_id)
    return (await db.scalar(stmt)) is not None


@router.get("", response_model=list[TaxOut])
async def list_taxes(
    q: str | None = Query(None, description="Search by name"),
    active: bool | None = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    stmt = select(TaxRule).order_by(TaxRule.id.desc()).limit(limit).offset(offset)
    if q and q.strip():
        stmt = stmt.where(TaxRule.name.ilike(f"%{q.strip()}%"))
    if active is not None:
        stmt = stmt.where(TaxRule.is_active == active)
    return (await db.scalars(stmt)).all()


@router.post("", response_model=TaxOut, status_code=status.HTTP_201_CREATED)
async def create_tax(body: TaxIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)):
    data = body.model_dump()
    data["name"] = data["name"].strip()
    if await _name_taken(db, data["name"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "A tax rule with this name already exists.")
    tax = TaxRule(**data)
    db.add(tax)
    await db.commit()
    return await _load(db, tax.id)


@router.put("/{tax_id}", response_model=TaxOut)
async def update_tax(
    tax_id: int, body: TaxIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)
):
    tax = await _load(db, tax_id)
    if tax is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tax rule not found.")
    data = body.model_dump()
    data["name"] = data["name"].strip()
    if await _name_taken(db, data["name"], exclude_id=tax_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A tax rule with this name already exists.")
    for key, value in data.items():
        setattr(tax, key, value)
    await db.commit()
    return await _load(db, tax_id)
