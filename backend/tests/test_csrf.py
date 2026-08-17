import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from fastapi import status
from app.core.redis import blacklist_token
import app.core.redis as redis_module

class FakeAsyncRedis:
    def __init__(self):
        self.store = {}
    async def get(self, key): return self.store.get(key)
    async def setex(self, key, time, val): self.store[key] = val; return True
    async def set(self, key, val, nx=False, ex=None):
        if nx and key in self.store: return None
        self.store[key] = val; return True
    async def close(self): pass
    async def ping(self): return True

@pytest.mark.asyncio
async def test_csrf_protection_suite():
    redis_module.redis_client = FakeAsyncRedis()
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        # Register user
        test_email = f"csrf_test_{uuid.uuid4().hex[:8]}@example.com"
        res_reg = await client.post("/api/v1/auth/register", json={
            "email": test_email,
            "password": "SecurePassword123!",
            "full_name": "CSRF Tester",
            "company_name": "CSRF Corp"
        })
        assert res_reg.status_code == status.HTTP_200_OK

        # Login to get cookies
        res_login = await client.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": "SecurePassword123!",
        })
        assert res_login.status_code == status.HTTP_200_OK
        
        cookies = res_login.cookies
        csrf_cookie = cookies.get("csrf_token")
        acc_cookie = cookies.get("access_token")
        
        assert csrf_cookie is not None
        assert acc_cookie is not None
        
        # Test 1: GET request shouldn't require CSRF header
        res_get = await client.get("/api/v1/users/me", cookies=cookies)
        assert res_get.status_code == status.HTTP_200_OK

        # Test 2: PUT request WITH CSRF header -> Success
        headers = {"X-CSRF-Token": csrf_cookie}
        res_put = await client.put("/api/v1/users/me", cookies=cookies, headers=headers, json={"full_name": "New Name"})
        assert res_put.status_code == status.HTTP_200_OK
        
        # Test 3: PUT request WITHOUT CSRF header -> 403
        res_put_no_header = await client.put("/api/v1/users/me", cookies=cookies, json={"full_name": "New Name 2"})
        assert res_put_no_header.status_code == status.HTTP_403_FORBIDDEN
        
        # Test 4: PUT request WITH WRONG CSRF header -> 403
        wrong_headers = {"X-CSRF-Token": "invalid_token"}
        res_put_wrong = await client.put("/api/v1/users/me", cookies=cookies, headers=wrong_headers, json={"full_name": "New Name 3"})
        assert res_put_wrong.status_code == status.HTTP_403_FORBIDDEN
        
        # Test 5: PUT request WITHOUT CSRF cookie -> 403
        bad_cookies = {"access_token": acc_cookie}
        res_put_no_cookie = await client.put("/api/v1/users/me", cookies=bad_cookies, headers=headers, json={"full_name": "New Name 4"})
        assert res_put_no_cookie.status_code == status.HTTP_403_FORBIDDEN
        
        # Test 6: POST request to refresh WITHOUT CSRF header -> 403
        res_refresh_no_csrf = await client.post("/api/v1/auth/refresh", cookies=cookies)
        assert res_refresh_no_csrf.status_code == status.HTTP_403_FORBIDDEN

        # Test 7: Logout clears csrf_token
        res_logout = await client.post("/api/v1/auth/logout", cookies=cookies, headers=headers)
        assert res_logout.status_code == status.HTTP_200_OK
        
        # check that csrf_token is empty or deleted in the response
        assert "csrf_token" in res_logout.cookies
        # It's usually empty string or deleted depending on framework, max-age=0
        
