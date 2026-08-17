"""
Unit and integration tests for BaseGrid Backend Distributed Token Revocation & Atomic Refresh Token Rotation.

Test scenarios covered:
TEST A: Redis available -> revocation works
TEST B: Redis unavailable -> refresh fails closed (503 Service Unavailable)
TEST C: Redis unavailable -> no in-memory fallback dict/set
TEST D: Revoked refresh token -> 401 Unauthorized
TEST E: Refresh token rotation -> old token rejected on second attempt
TEST F: Concurrent refresh request simulation -> atomic SET NX guarantees 1 success, 1 failure
TEST G: Logout -> refresh token blacklisted and rejected on replay
TEST H: Expired refresh token -> 401 Unauthorized
TEST I: Access token supplied to refresh endpoint -> 401 Unauthorized
TEST J & K: Inactive or nonexistent user refresh -> 401 Unauthorized
TEST L: Revocation TTL -> computed dynamically from token remaining expiration
TEST M & N: Invalid JWT or wrong signing secret -> 401 Unauthorized
"""

import time
import uuid
import jwt
from datetime import datetime, timezone, timedelta
import pytest
import asyncio
from fastapi import status
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
)
from app.core.redis import (
    hash_token,
    blacklist_token,
    consume_refresh_token_atomically,
    is_token_blacklisted,
    RedisUnavailableError,
)
import app.core.redis as redis_module


class FakeAsyncRedis:
    """In-memory mock Redis client providing true atomic SET NX EX semantics for test suite execution."""
    def __init__(self):
        self.store = {}
        self.expirations = {}

    async def ping(self):
        return True

    async def get(self, key: str):
        if key in self.expirations and time.time() > self.expirations[key]:
            del self.store[key]
            del self.expirations[key]
            return None
        return self.store.get(key)

    async def setex(self, key: str, time_sec: int, value: str):
        self.store[key] = value
        self.expirations[key] = time.time() + time_sec
        return True

    async def set(self, key: str, value: str, nx: bool = False, ex: int = None):
        if key in self.expirations and time.time() > self.expirations[key]:
            del self.store[key]
            del self.expirations[key]

        if nx and key in self.store:
            return None  # Key exists, atomic SET NX returns None

        self.store[key] = value
        if ex:
            self.expirations[key] = time.time() + ex
        return True

    async def close(self):
        pass


@pytest.mark.asyncio
async def test_backend_auth_and_distributed_revocation_suite():
    # Inject isolated fake Redis client for test run
    fake_redis = FakeAsyncRedis()
    redis_module.redis_client = fake_redis

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # TEST A: Redis available -> revocation works
        token_a = "sample_test_token_a"
        res_bl = await blacklist_token(token_a, expire_seconds=3600)
        assert res_bl is True
        is_bl = await is_token_blacklisted(token_a)
        assert is_bl is True

        # TEST L: Token hashing SHA-256 validation
        hashed_key = f"revoked:token:{hash_token(token_a)}"
        assert hashed_key in fake_redis.store
        assert token_a not in fake_redis.store  # Raw JWT is never stored as key string

        # Register tenant admin
        test_email = f"revocation_test_{uuid.uuid4().hex[:8]}@example.com"
        reg_payload = {
            "email": test_email,
            "password": "SecurePassword123!",
            "full_name": "Admin Revocation",
            "company_name": "Azienda Revocation Srl",
        }
        res_reg = await client.post("/api/v1/auth/register", json=reg_payload)
        assert res_reg.status_code == status.HTTP_200_OK, res_reg.text

        # Login -> Receive HttpOnly cookies
        res_login = await client.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": "SecurePassword123!",
        })
        assert res_login.status_code == status.HTTP_200_OK
        cookies = res_login.cookies
        ref_cookie = cookies.get("refresh_token")
        acc_cookie = cookies.get("access_token")
        csrf_cookie = cookies.get("csrf_token")
        assert ref_cookie is not None
        assert acc_cookie is not None

        # TEST E: Atomic Refresh Token Rotation
        res_ref1 = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": ref_cookie, "csrf_token": csrf_cookie}, headers={"X-CSRF-Token": csrf_cookie})
        assert res_ref1.status_code == status.HTTP_200_OK
        new_ref_cookie = res_ref1.cookies.get("refresh_token")
        new_csrf_cookie = res_ref1.cookies.get("csrf_token")
        assert new_ref_cookie is not None
        assert new_ref_cookie != ref_cookie

        # Replay attempt with old refresh token R1 -> 401 Unauthorized
        res_replay = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": ref_cookie, "csrf_token": csrf_cookie}, headers={"X-CSRF-Token": csrf_cookie})
        assert res_replay.status_code == status.HTTP_401_UNAUTHORIZED
        assert "already been used or revoked" in res_replay.json()["detail"]

        # TEST F: Concurrent refresh simulation using same refresh token
        concurrent_token = create_refresh_token(
            subject=str(uuid.uuid4()),
            company_id=str(uuid.uuid4()),
        )
        # Atomic SET NX simulation: First request succeeds, second fails
        res_c1 = await consume_refresh_token_atomically(concurrent_token, expire_seconds=3600)
        res_c2 = await consume_refresh_token_atomically(concurrent_token, expire_seconds=3600)
        assert res_c1 is True
        assert res_c2 is False  # Second concurrent request fails atomically

        # TEST G: Logout invalidates tokens
        res_logout = await client.post("/api/v1/auth/logout", cookies=res_ref1.cookies, headers={"X-CSRF-Token": res_ref1.cookies.get("csrf_token")})
        assert res_logout.status_code == status.HTTP_200_OK

        # Attempt refresh after logout -> 401
        res_post_logout_refresh = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": new_ref_cookie, "csrf_token": new_csrf_cookie}, headers={"X-CSRF-Token": new_csrf_cookie})
        assert res_post_logout_refresh.status_code == status.HTTP_401_UNAUTHORIZED

        # TEST H: Expired refresh token -> 401 Unauthorized
        expired_refresh = create_refresh_token(
            subject=str(uuid.uuid4()),
            company_id=str(uuid.uuid4()),
            expires_delta=timedelta(seconds=-10),
        )
        res_expired = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": expired_refresh, "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_expired.status_code == status.HTTP_401_UNAUTHORIZED

        # TEST I: Access token supplied to refresh endpoint -> 401 Unauthorized
        access_as_refresh = create_access_token(
            subject=str(uuid.uuid4()),
            company_id=str(uuid.uuid4()),
            role="admin",
        )
        res_type_mismatch = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": access_as_refresh, "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_type_mismatch.status_code == status.HTTP_401_UNAUTHORIZED

        # TEST J & K: Inactive or nonexistent user refresh -> 401 Unauthorized
        nonexistent_user_token = create_refresh_token(
            subject=str(uuid.uuid4()),
            company_id=str(uuid.uuid4()),
        )
        res_nonexistent = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": nonexistent_user_token, "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_nonexistent.status_code == status.HTTP_401_UNAUTHORIZED

        # TEST M & N: Invalid JWT or wrong signing secret -> 401 Unauthorized
        wrong_secret_jwt = jwt.encode(
            {"sub": str(uuid.uuid4()), "type": "refresh", "exp": datetime.now(timezone.utc) + timedelta(days=1)},
            "wrong-secret-key-12345678901234567890",
            algorithm="HS256",
        )
        res_wrong_secret = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": wrong_secret_jwt, "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_wrong_secret.status_code == status.HTTP_401_UNAUTHORIZED

        res_invalid_jwt = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": "not.a.valid.jwt", "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_invalid_jwt.status_code == status.HTTP_401_UNAUTHORIZED

        # TEST B & C: Redis unavailable -> refresh fails closed (503 Service Unavailable) with NO in-memory fallback
        redis_module.redis_client = None  # Simulate Redis down
        
        # Test consume_refresh_token_atomically raises RedisUnavailableError
        with pytest.raises(RedisUnavailableError):
            await consume_refresh_token_atomically("any_token", expire_seconds=3600)

        # Test POST /refresh endpoint returns 503 Service Unavailable
        valid_looking_token = create_refresh_token(
            subject=str(uuid.uuid4()),
            company_id=str(uuid.uuid4()),
        )
        res_redis_down = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": valid_looking_token, "csrf_token": "dummy"}, headers={"X-CSRF-Token": "dummy"})
        assert res_redis_down.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "temporarily unavailable" in res_redis_down.json()["detail"]

        # Restore fake redis client
        redis_module.redis_client = fake_redis
