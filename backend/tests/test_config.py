"""
Unit and Integration Tests for BaseGrid Production Secret Management (P0.2.1)

Test scenarios covered:
- TEST 1: production + valid secrets -> Settings initializes successfully
- TEST 2: production + missing SECRET_KEY -> rejected with clear error
- TEST 3: production + default placeholder SECRET_KEY -> rejected with clear error
- TEST 4: production + short (<32 chars) SECRET_KEY -> rejected with clear error
- TEST 5: production + missing DATABASE_URL -> rejected with clear error
- TEST 6: production + insecure placeholder DATABASE_URL -> rejected with clear error
- TEST 7: production + missing REDIS_URL -> rejected with clear error
- TEST 8: production + insecure default SUPERADMIN_PASSWORD -> rejected with clear error
- TEST 9: development / test mode -> safe dev defaults provided without production secrets
- TEST 10: secret sanitization -> no secret values are ever leaked in exception messages
"""

import os
import pytest
from pydantic import ValidationError
from app.core.config import Settings


def test_production_valid_config(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod_super_secure_32_byte_secret_key_value_12345!")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass_999@prod-db.example.com:5432/prod_db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:prod_redis_pass@prod-redis.example.com:6379/0")
    monkeypatch.setenv("SUPERADMIN_EMAIL", "admin@prod.example.com")
    monkeypatch.setenv("SUPERADMIN_PASSWORD", "ProdSuperAdminPassword2026!")

    s = Settings()
    assert s.ENV == "production"
    assert s.SECRET_KEY == "prod_super_secure_32_byte_secret_key_value_12345!"
    assert s.DATABASE_URL == "postgresql+asyncpg://prod_user:prod_pass_999@prod-db.example.com:5432/prod_db"
    assert s.REDIS_URL == "rediss://default:prod_redis_pass@prod-redis.example.com:6379/0"


def test_production_missing_secret_key_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass@prod-db:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "SECRET_KEY environment variable is required in production" in err_msg


def test_production_placeholder_secret_key_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "super-secret-cryptographic-jwt-key-change-in-production-environments-32bytes")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass@prod-db:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "insecure default placeholder" in err_msg


def test_production_short_secret_key_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "short_secret_123")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass@prod-db:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "at least 32 characters" in err_msg


def test_production_missing_database_url_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod_super_secure_32_byte_secret_key_value_12345!")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "DATABASE_URL environment variable is required in production" in err_msg


def test_production_insecure_database_url_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod_super_secure_32_byte_secret_key_value_12345!")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:secure_change_me_in_prod_123!@host:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "insecure default credentials" in err_msg


def test_production_missing_redis_url_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod_super_secure_32_byte_secret_key_value_12345!")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass@host:5432/db")
    monkeypatch.delenv("REDIS_URL", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "REDIS_URL environment variable is required in production" in err_msg


def test_production_insecure_superadmin_password_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod_super_secure_32_byte_secret_key_value_12345!")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://prod_user:prod_pass@host:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@prod-redis:6379/0")
    monkeypatch.setenv("SUPERADMIN_EMAIL", "saas@rapporti.it")
    monkeypatch.setenv("SUPERADMIN_PASSWORD", "Jacopo 2011")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    assert "SUPERADMIN_PASSWORD environment variable is using an insecure default value" in err_msg


def test_development_mode_safe_defaults(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)

    s = Settings()
    assert s.ENV == "development"
    assert s.SECRET_KEY == "dev-only-local-secret-key-do-not-use-in-production-mode-32bytes"
    assert "postgresql+asyncpg://" in s.DATABASE_URL
    assert "redis://" in s.REDIS_URL


def test_no_secret_leaks_in_validation_errors(monkeypatch):
    sensitive_secret_sample = "SUPER_CONFIDENTIAL_SECRET_12345_XYZ"
    monkeypatch.setenv("ENV", "production")
    # Intentional short key containing secret sample to trigger validation failure
    monkeypatch.setenv("SECRET_KEY", "short_key")
    monkeypatch.setenv("DATABASE_URL", f"postgresql+asyncpg://user:{sensitive_secret_sample}@db:5432/db")
    monkeypatch.setenv("REDIS_URL", "rediss://default:pass@redis:6379/0")

    with pytest.raises(ValidationError) as exc_info:
        Settings()

    err_msg = str(exc_info.value)
    # Ensure sensitive value is NOT printed in the exception error message
    assert sensitive_secret_sample not in err_msg
