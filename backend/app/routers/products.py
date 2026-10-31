from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_roles
from app.models.product import Product, ProductVariant
from app.models.user import UserRole
from app.schemas.product import ProductIn, ProductOut

router = APIRouter(prefix="/products", tags=["products"])

staff_or_admin = require_roles(UserRole.admin, UserRole.staff)
admin_only = require_roles(UserRole.admin)


async def _load(db: AsyncSession, product_id: int) -> Product | None:
    # populate_existing forces a fresh read (picks up server-set values like created_at)
    return await db.scalar(
        select(Product).where(Product.id == product_id).execution_options(populate_existing=True)
    )


@router.get("", response_model=list[ProductOut])
async def list_products(
    q: str | None = Query(None, description="Search by name"),
    product_type: str | None = None,
    active: bool | None = None,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(staff_or_admin),
):
    stmt = select(Product).order_by(Product.id.desc()).limit(limit).offset(offset)
    if q and q.strip():
        stmt = stmt.where(Product.name.ilike(f"%{q.strip()}%"))
    if product_type:
        stmt = stmt.where(Product.product_type == product_type)
    if active is not None:
        stmt = stmt.where(Product.is_active == active)
    return (await db.scalars(stmt)).all()


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int, db: AsyncSession = Depends(get_db), _user=Depends(staff_or_admin)
):
    product = await _load(db, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    return product


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductIn, db: AsyncSession = Depends(get_db), _admin=Depends(admin_only)
):
    product = Product(
        name=body.name.strip(),
        product_type=body.product_type,
        sales_price=body.sales_price,
        cost_price=body.cost_price,
        notes=(body.notes or "").strip() or None,
        is_active=body.is_active,
        variants=[
            ProductVariant(
                attribute=v.attribute.strip(), value=v.value.strip(), extra_price=v.extra_price
            )
            for v in body.variants
        ],
    )
    db.add(product)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate variant on this product.")
    return await _load(db, product.id)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    body: ProductIn,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(admin_only),
):
    """Full update. Variants with an id are updated, without an id created,
    and existing variants missing from the list are removed."""
    product = await _load(db, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    product.name = body.name.strip()
    product.product_type = body.product_type
    product.sales_price = body.sales_price
    product.cost_price = body.cost_price
    product.notes = (body.notes or "").strip() or None
    product.is_active = body.is_active

    existing = {v.id: v for v in product.variants}
    keep: set[int] = set()
    for vin in body.variants:
        if vin.id is not None:
            variant = existing.get(vin.id)
            if variant is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown variant id {vin.id}."
                )
            variant.attribute = vin.attribute.strip()
            variant.value = vin.value.strip()
            variant.extra_price = vin.extra_price
            keep.add(vin.id)
        else:
            product.variants.append(
                ProductVariant(
                    attribute=vin.attribute.strip(),
                    value=vin.value.strip(),
                    extra_price=vin.extra_price,
                )
            )
    for vid, variant in existing.items():
        if vid not in keep:
            product.variants.remove(variant)  # delete-orphan removes the row

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate variant on this product.")
    return await _load(db, product_id)
