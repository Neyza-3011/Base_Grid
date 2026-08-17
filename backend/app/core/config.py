from typing import List, Union, Optional
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET_PLACEHOLDERS = {
    "super-secret-cryptographic-jwt-key-change-in-production-environments-32bytes",
    "super-secret-cryptographic-jwt-key-replace-in-production-environments",
    "secret",
    "changeme",
    "default",
}

INSECURE_DB_PATTERNS = [
    "secure_change_me_in_prod_123!",
]


class Settings(BaseSettings):
    PROJECT_NAME: str = "BaseGrid Enterprise API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"

    # JWT Authentication
    SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Superadmin Dynamic Seeder Config
    SUPERADMIN_EMAIL: Optional[str] = None
    SUPERADMIN_PASSWORD: Optional[str] = None
    SUPERADMIN_COMPANY_NAME: str = "Rapportini Enterprise B2B"

    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # CORS Configuration
    ALLOWED_ORIGINS: Union[str, List[str]] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @model_validator(mode="before")
    @classmethod
    def assemble_cors_origins(cls, data: dict) -> dict:
        if isinstance(data, dict):
            v = data.get("ALLOWED_ORIGINS")
            if isinstance(v, str) and not v.startswith("["):
                data["ALLOWED_ORIGINS"] = [i.strip() for i in v.split(",") if i.strip()]
        return data

    # PostgreSQL Database
    POSTGRES_SERVER: Optional[str] = None
    POSTGRES_PORT: Optional[int] = 5432
    POSTGRES_USER: Optional[str] = None
    POSTGRES_PASSWORD: Optional[str] = None
    POSTGRES_DB: Optional[str] = None
    DATABASE_URL: Optional[str] = None

    # Redis
    REDIS_HOST: Optional[str] = None
    REDIS_PORT: Optional[int] = 6379
    REDIS_URL: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        env_lower = (self.ENV or "development").strip().lower()

        # Non-production (development, test, dev): populate safe default mock fallbacks if missing
        if env_lower in ("development", "test", "dev"):
            if not self.SECRET_KEY:
                self.SECRET_KEY = "dev-only-local-secret-key-do-not-use-in-production-mode-32bytes"
            if not self.DATABASE_URL:
                user = self.POSTGRES_USER or "rapportini_user"
                pwd = self.POSTGRES_PASSWORD or "dev_password_only"
                server = self.POSTGRES_SERVER or "db"
                port = self.POSTGRES_PORT or 5432
                db_name = self.POSTGRES_DB or "rapportini_db"
                self.DATABASE_URL = f"postgresql+asyncpg://{user}:{pwd}@{server}:{port}/{db_name}"
            if not self.REDIS_URL:
                host = self.REDIS_HOST or "redis"
                port = self.REDIS_PORT or 6379
                self.REDIS_URL = f"redis://{host}:{port}/0"
            if not self.SUPERADMIN_EMAIL:
                self.SUPERADMIN_EMAIL = "saas@rapporti.it"
            if not self.SUPERADMIN_PASSWORD:
                self.SUPERADMIN_PASSWORD = "DevPassword123!"
            return self

        # Production environment: enforce STRICT zero-fallback security validation!
        if env_lower == "production":
            # 1. SECRET_KEY validation
            if not self.SECRET_KEY or not self.SECRET_KEY.strip():
                raise ValueError("SECRET_KEY environment variable is required in production.")

            clean_secret = self.SECRET_KEY.strip()
            if (
                clean_secret in INSECURE_SECRET_PLACEHOLDERS
                or "change-in-production" in clean_secret.lower()
                or "replace-in-production" in clean_secret.lower()
            ):
                raise ValueError("SECRET_KEY environment variable is using an insecure default placeholder in production.")

            if len(clean_secret) < 32:
                raise ValueError("SECRET_KEY environment variable must be at least 32 characters long in production.")

            # 2. DATABASE_URL validation
            if not self.DATABASE_URL or not self.DATABASE_URL.strip():
                raise ValueError("DATABASE_URL environment variable is required in production.")

            clean_db_url = self.DATABASE_URL.strip()
            for pattern in INSECURE_DB_PATTERNS:
                if pattern in clean_db_url:
                    raise ValueError("DATABASE_URL environment variable contains insecure default credentials in production.")

            # 3. REDIS_URL validation
            if not self.REDIS_URL or not self.REDIS_URL.strip():
                raise ValueError("REDIS_URL environment variable is required in production.")

            # 4. SUPERADMIN_PASSWORD validation
            if self.SUPERADMIN_EMAIL:
                if not self.SUPERADMIN_PASSWORD or not self.SUPERADMIN_PASSWORD.strip():
                    raise ValueError("SUPERADMIN_PASSWORD environment variable is required in production when SUPERADMIN_EMAIL is configured.")
                if self.SUPERADMIN_PASSWORD.strip() == "Jacopo 2011":
                    raise ValueError("SUPERADMIN_PASSWORD environment variable is using an insecure default value in production.")

        return self


settings = Settings()
