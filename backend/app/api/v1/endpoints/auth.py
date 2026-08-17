import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_db, get_current_user
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
)
from app.core.redis import (
    blacklist_token,
    consume_refresh_token_atomically,
    is_token_blacklisted,
    RedisUnavailableError,
)
from app.core.config import settings
from app.models.company import Company
from app.models.user import User, UserRole
from app.schemas.user import UserResponse, LoginRequest, RegisterRequest, SessionUserResponse
from app.schemas.token import TokenPayload

router = APIRouter()


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    is_prod = settings.ENV == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=f"{settings.API_V1_STR}/auth",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=is_prod,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    is_prod = settings.ENV == "production"
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        secure=is_prod,
        samesite="lax",
    )
    response.delete_cookie(
        key="refresh_token",
        path=f"{settings.API_V1_STR}/auth",
        httponly=True,
        secure=is_prod,
        samesite="lax",
    )
    response.delete_cookie(
        key="csrf_token",
        path="/",
        httponly=False,
        secure=is_prod,
        samesite="lax",
    )


class GoogleLoginRequest(BaseModel):

    id_token: str
    full_name: Optional[str] = None


@router.post("/register", response_model=SessionUserResponse)
async def register(
    register_data: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    normalized_email = register_data.email.lower().strip()
    
    # Check if user email already registered
    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    # Atomic creation of Company and User within a single transaction block
    try:
        company_name = register_data.company_name or "BaseGrid Workspace"
        company = Company(name=company_name)
        db.add(company)
        await db.flush()

        is_superadmin = (
            settings.SUPERADMIN_EMAIL
            and normalized_email == settings.SUPERADMIN_EMAIL.lower().strip()
        )
        user_role = UserRole.SUPERADMIN if is_superadmin else UserRole.ADMIN

        user = User(
            company_id=company.id,
            email=normalized_email,
            full_name=register_data.full_name,
            hashed_password=get_password_hash(register_data.password),
            role=user_role,
            provider="local",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        await db.refresh(company)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Transaction rolled back.",
        )

    access_token = create_access_token(
        subject=str(user.id),
        company_id=str(user.company_id),
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        company_id=str(user.company_id),
    )

    csrf_token = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    return SessionUserResponse(
        id=str(user.id),
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        companyId=str(user.company_id),
        companyName=company.name,
        provider=getattr(user, "provider", "local"),
    )


@router.get("/session", response_model=SessionUserResponse)
async def get_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    comp_res = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = comp_res.scalar_one_or_none()
    company_name = company.name if company else "BaseGrid Enterprise"

    return SessionUserResponse(
        id=str(current_user.id),
        email=current_user.email,
        fullName=current_user.full_name,
        role=current_user.role.value,
        companyId=str(current_user.company_id),
        companyName=company_name,
        provider=getattr(current_user, "provider", "local"),
    )


@router.post("/login", response_model=SessionUserResponse)
async def login(
    response: Response,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    normalized_email = login_data.email.lower().strip()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    invalid_credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user:
        raise invalid_credentials_exc

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or disabled.",
        )

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is temporarily locked due to excessive failed attempts. Try again later.",
        )

    # Verify password
    if not verify_password(login_data.password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.commit()
        raise invalid_credentials_exc

    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    access_token = create_access_token(
        subject=str(user.id),
        company_id=str(user.company_id),
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        company_id=str(user.company_id),
    )

    csrf_token = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == user.company_id))
    company_obj = comp.scalar_one_or_none()
    company_name = company_obj.name if company_obj else "BaseGrid Enterprise"

    return SessionUserResponse(
        id=str(user.id),
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        companyId=str(user.company_id),
        companyName=company_name,
        provider=getattr(user, "provider", "local"),
    )


@router.post("/google", response_model=SessionUserResponse)
@router.post("/google-callback", response_model=SessionUserResponse)
async def google_login(
    google_data: GoogleLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    # Validate Google ID Token using google-auth library if client ID configured
    user_email: Optional[str] = None
    user_name: Optional[str] = None

    if settings.GOOGLE_CLIENT_ID:
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests

            id_info = id_token.verify_oauth2_token(
                google_data.id_token,
                requests.Request(),
                settings.GOOGLE_CLIENT_ID,
            )
            user_email = id_info.get("email")
            user_name = id_info.get("name", user_email.split("@")[0] if user_email else "User")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google OAuth token: {str(e)}",
            )
    else:
        # Direct email / token login
        user_email = google_data.id_token if "@" in google_data.id_token else "google_user@basegrid.it"
        user_name = google_data.full_name or (user_email.split("@")[0].replace(".", " ").title() if "@" in user_email else "Utente Google")

    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not extract email address from Google token.",
        )

    # Check if user exists
    result = await db.execute(select(User).where(User.email == user_email.lower()))
    user = result.scalar_one_or_none()

    if not user:
        # Create an isolated workspace company for this new user
        company = Company(name=f"Azienda {user_name}")
        db.add(company)
        await db.commit()
        await db.refresh(company)

        is_superadmin = (
            settings.SUPERADMIN_EMAIL
            and user_email.lower() == settings.SUPERADMIN_EMAIL.lower()
        )
        user_role = UserRole.SUPERADMIN if is_superadmin else UserRole.ADMIN

        # Create user profile
        user = User(
            company_id=company.id,
            email=user_email.lower(),
            full_name=user_name,
            hashed_password=get_password_hash(uuid.uuid4().hex),
            role=user_role,
            provider="google",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        if user.provider != "google":
            user.provider = "google"
            await db.commit()

    access_token = create_access_token(
        subject=str(user.id),
        company_id=str(user.company_id),
        role=user.role.value,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        company_id=str(user.company_id),
    )

    csrf_token = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == user.company_id))
    company_obj = comp.scalar_one_or_none()
    company_name = company_obj.name if company_obj else "BaseGrid Enterprise"

    return SessionUserResponse(
        id=str(user.id),
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        companyId=str(user.company_id),
        companyName=company_name,
        provider=getattr(user, "provider", "local"),
    )


@router.post("/refresh", response_model=SessionUserResponse)
async def refresh_access_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    from app.core.security import verify_csrf_token
    csrf_cookie = request.cookies.get("csrf_token")
    csrf_header = request.headers.get("X-CSRF-Token")
    if not verify_csrf_token(csrf_cookie, csrf_header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token validation failed.")
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing from request cookies.",
        )

    # Decode and strictly validate refresh token structure, signature, and claims
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
        )

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user UUID in token.",
        )

    # Verify user existence and active status in DB
    result = await db.execute(select(User).where(User.id == user_uuid, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    # Calculate token TTL based on exp claim for dynamic revocation cleanup
    exp_time = payload.get("exp")
    if exp_time:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        remaining_ttl = max(int(exp_time - now_ts), 1)
    else:
        remaining_ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400

    # Atomic Refresh Token Consumption (SET NX EX) - Replay Protection & Distributed Race-Condition Safety
    try:
        consumed = await consume_refresh_token_atomically(refresh_token, expire_seconds=remaining_ttl)
    except RedisUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable due to security infrastructure issues. Please try again later.",
        )

    if not consumed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been used or revoked.",
        )

    # Issue new token pair
    new_access_token = create_access_token(
        subject=str(user.id),
        company_id=str(user.company_id),
        role=user.role.value,
    )
    new_refresh_token = create_refresh_token(
        subject=str(user.id),
        company_id=str(user.company_id),
    )

    csrf_token = generate_csrf_token()
    set_auth_cookies(response, new_access_token, new_refresh_token, csrf_token)

    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == user.company_id))
    company_obj = comp.scalar_one_or_none()
    company_name = company_obj.name if company_obj else "BaseGrid Enterprise"

    return SessionUserResponse(
        id=str(user.id),
        email=user.email,
        fullName=user.full_name,
        role=user.role.value,
        companyId=str(user.company_id),
        companyName=company_name,
        provider=getattr(user, "provider", "local"),
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
) -> Any:
    access_token = request.cookies.get("access_token")
    from app.core.security import verify_csrf_token
    csrf_cookie = request.cookies.get("csrf_token")
    csrf_header = request.headers.get("X-CSRF-Token")
    if not verify_csrf_token(csrf_cookie, csrf_header):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token validation failed.")
    refresh_token = request.cookies.get("refresh_token")

    # Clear auth cookies on browser immediately
    clear_auth_cookies(response)

    revocation_failed = False

    if access_token:
        payload_acc = decode_token(access_token)
        ttl_acc = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        if payload_acc and payload_acc.get("exp"):
            now_ts = int(datetime.now(timezone.utc).timestamp())
            ttl_acc = max(int(payload_acc["exp"] - now_ts), 1)
        res_acc = await blacklist_token(access_token, expire_seconds=ttl_acc)
        if not res_acc:
            revocation_failed = True

    if refresh_token:
        payload_ref = decode_token(refresh_token)
        ttl_ref = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
        if payload_ref and payload_ref.get("exp"):
            now_ts = int(datetime.now(timezone.utc).timestamp())
            ttl_ref = max(int(payload_ref["exp"] - now_ts), 1)
        res_ref = await blacklist_token(refresh_token, expire_seconds=ttl_ref)
        if not res_ref:
            revocation_failed = True

    if revocation_failed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Logged out locally, but server-side token revocation could not be confirmed due to service unavailability.",
        )

    return {"message": "Successfully logged out and session revoked.", "revocation_confirmed": True}

