from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        
        # Enforce Security Headers compatible with AI Studio iframe preview
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "accelerometer=(), camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' * data: blob: 'unsafe-inline' 'unsafe-eval'; "
            "script-src 'self' * 'unsafe-inline' 'unsafe-eval' blob:; "
            "style-src 'self' * 'unsafe-inline'; "
            "img-src 'self' * data: blob:; "
            "font-src 'self' * data:; "
            "connect-src 'self' * ws: wss:; "
            "frame-ancestors *;"
        )
        return response

