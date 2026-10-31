from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    StaffCreate,
    TokenResponse,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.email_service import send_password_reset

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_TAKEN = "An account with this email already exists."


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


async def _create_user(db: AsyncSession, *, email: str, full_name: str, password: str,
                       role: UserRole, company: str | None = None) -> User:
    email = email.lower().strip()
    exists = await db.scalar(select(User.id).where(User.email == email))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN)
    user = User(
        email=email,
        full_name=full_name.strip(),
        company=(company or "").strip() or None,
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:  # two requests racing on the same email
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, EMAIL_TAKEN)
    await db.refresh(user)
    return user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Public sign-up. Always creates a customer."""
    return await _create_user(
        db, email=body.email, full_name=body.full_name, password=body.password,
        role=UserRole.customer, company=body.company,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated.")
    return _token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    user = await db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    return _token_response(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if user and user.is_active:
        token = create_reset_token(user.id, user.hashed_password)
        link = f"{settings.frontend_url}/reset-password?token={token}"
        background.add_task(send_password_reset, user.email, link)
    # Same answer whether or not the email exists, so accounts can't be probed.
    return {"message": "If that email is registered, a reset link is on its way."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    invalid = HTTPException(
        status.HTTP_400_BAD_REQUEST, "This reset link is invalid or has expired."
    )
    try:
        payload = decode_token(body.token, "reset")
    except ValueError:
        raise invalid
    user = await db.get(User, int(payload["sub"]))
    if user is None or payload.get("pwd") != user.hashed_password[-12:]:
        raise invalid
    user.hashed_password = hash_password(body.password)
    await db.commit()
    return {"message": "Password updated. You can sign in now."}


@router.post("/staff", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: StaffCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_roles(UserRole.admin)),
):
    """Admin only: add a member of staff."""
    return await _create_user(
        db, email=body.email, full_name=body.full_name, password=body.password,
        role=UserRole.staff,
    )
