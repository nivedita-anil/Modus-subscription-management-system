from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.user import User, UserRole
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    role: UserRole = Query(UserRole.customer),
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(require_roles(UserRole.admin, UserRole.staff)),
):
    """Staff pick customers from here. Only an admin may list staff or admins."""
    if role != UserRole.customer and me.role != UserRole.admin:
        raise HTTPException(403, "You don't have access to this.")
    stmt = select(User).where(User.role == role).order_by(User.full_name).limit(limit).offset(offset)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like), User.company.ilike(like)))
    return (await db.scalars(stmt)).all()
