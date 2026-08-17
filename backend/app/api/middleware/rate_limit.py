from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from app.core.redis import check_rate_limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "127.0.0.1"
        path = request.url.path

        # Stricter rate limits for authentication endpoints
        if "/api/v1/auth/login" in path:
            max_req = 5
            window = 60
            key = f"rate_limit:auth:{client_ip}"
        else:
            max_req = 100
            window = 60
            key = f"rate_limit:api:{client_ip}"

        allowed, retry_after = await check_rate_limit(key, max_requests=max_req, window_seconds=window)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too Many Requests. Rate limit threshold breached.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        return response
