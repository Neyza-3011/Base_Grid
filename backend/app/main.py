import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, status, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, select
from app.core.config import settings
from app.core.database import engine, Base, async_session_maker
from app.core.security import get_password_hash
from app.core.redis import get_redis_client, close_redis_connection
from app.api.v1.router import api_router
from app.api.middleware.security import SecurityHeadersMiddleware
from app.api.middleware.rate_limit import RateLimitMiddleware
from app.models.company import Company
from app.models.user import User, UserRole

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fastapi_app")


async def seed_superadmin():
    """Reads SUPERADMIN_EMAIL & SUPERADMIN_PASSWORD from settings and seeds master account if missing."""
    if not settings.SUPERADMIN_EMAIL or not settings.SUPERADMIN_PASSWORD:
        logger.info("No superadmin credentials provided in environment variables; skipping auto-seeding.")
        return

    async with async_session_maker() as session:
        try:
            # Check if superadmin exists
            result = await session.execute(
                select(User).where(User.email == settings.SUPERADMIN_EMAIL.lower())
            )
            admin_user = result.scalar_one_or_none()

            if not admin_user:
                logger.info(f"Seeding master superadmin account for {settings.SUPERADMIN_EMAIL}...")
                
                # Check for default company
                comp_result = await session.execute(select(Company).limit(1))
                company = comp_result.scalar_one_or_none()
                if not company:
                    company = Company(name=settings.SUPERADMIN_COMPANY_NAME)
                    session.add(company)
                    await session.commit()
                    await session.refresh(company)

                # Create Superadmin
                superadmin = User(
                    company_id=company.id,
                    email=settings.SUPERADMIN_EMAIL.lower(),
                    full_name="Master Administrator",
                    hashed_password=get_password_hash(settings.SUPERADMIN_PASSWORD),
                    role=UserRole.SUPERADMIN,
                    provider="local",
                    is_active=True,
                )
                session.add(superadmin)
                await session.commit()
                logger.info(f"Master superadmin account successfully provisioned for {settings.SUPERADMIN_EMAIL}")
            else:
                if admin_user.role != UserRole.SUPERADMIN:
                    admin_user.role = UserRole.SUPERADMIN
                    await session.commit()
                logger.info(f"Superadmin account ({settings.SUPERADMIN_EMAIL}) verified.")
        except Exception as e:
            logger.error(f"Error seeding superadmin account: {e}")
            await session.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing BaseGrid Async Backend...")
    # Auto-create tables on startup if not existing
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schemas verified.")

    # Seed master superadmin account from env
    await seed_superadmin()

    yield
    logger.info("Shutting down connections...")
    await close_redis_connection()
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs" if settings.ENV != "production" else None,
    redoc_url="/redoc" if settings.ENV != "production" else None,
    openapi_url="/openapi.json" if settings.ENV != "production" else None,
    lifespan=lifespan,
)

# 1. Custom Security Headers & Rate Limiting Middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

# 2. CORS Middleware configuration
cors_origins = (
    settings.ALLOWED_ORIGINS
    if isinstance(settings.ALLOWED_ORIGINS, list)
    else [str(settings.ALLOWED_ORIGINS)]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    max_age=600,
)


# 3. Mount V1 Master API Router
app.include_router(api_router, prefix=settings.API_V1_STR)


# 4. Healthcheck Router (/api/health)
@app.get("/api/health", tags=["health"])
async def health_check(response: Response):
    health_status = {"status": "ok", "postgres": "ok", "redis": "ok"}
    status_code = status.HTTP_200_OK

    # Test PostgreSQL Connection Socket
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"PostgreSQL health check failed: {e}")
        health_status["postgres"] = "error"
        health_status["status"] = "unhealthy"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    # Test Redis Connection Ping
    try:
        redis = await get_redis_client()
        if redis:
            await redis.ping()
        else:
            health_status["redis"] = "degraded"
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        health_status["redis"] = "error"

    response.status_code = status_code
    return health_status
