import hashlib
import logging
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("redis_manager")


class RedisUnavailableError(Exception):
    """Raised when critical Redis infrastructure is unreachable or operation fails."""
    pass


redis_client: Optional[aioredis.Redis] = None


def hash_token(token: str) -> str:
    """Computes a SHA-256 hex digest of a token to ensure non-reversible key naming and avoid logging raw JWTs."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def get_redis_client() -> Optional[aioredis.Redis]:
    global redis_client
    if redis_client is None:
        try:
            redis_client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=3.0,
            )
            await redis_client.ping()
        except Exception as e:
            logger.warning(f"Redis connection unavailable: {type(e).__name__}")
            redis_client = None
    return redis_client


async def close_redis_connection():
    global redis_client
    if redis_client:
        try:
            await redis_client.close()
        except Exception:
            pass
        redis_client = None


async def blacklist_token(token: str, expire_seconds: int = 86400) -> bool:
    """
    Revokes a token in Redis by storing its SHA-256 hash.
    Returns True if successfully stored in Redis, False if Redis is unavailable or operation failed.
    No in-memory fallback is used in production.
    """
    client = await get_redis_client()
    if not client:
        return False

    token_hash = hash_token(token)
    try:
        await client.setex(f"revoked:token:{token_hash}", expire_seconds, "revoked")
        return True
    except Exception as e:
        logger.error(f"Failed to blacklist token in Redis: {type(e).__name__}")
        return False


async def consume_refresh_token_atomically(token: str, expire_seconds: int = 86400) -> bool:
    """
    Atomically consumes a refresh token for rotation and replay protection using Redis SET NX EX.
    Returns True if the token was successfully consumed for the FIRST time.
    Returns False if the token was ALREADY consumed or revoked.
    Raises RedisUnavailableError if Redis is unreachable.
    """
    client = await get_redis_client()
    if not client:
        raise RedisUnavailableError("Redis is unavailable for atomic token consumption.")

    token_hash = hash_token(token)
    key = f"revoked:token:{token_hash}"

    try:
        # Atomic Redis single command: SET key value NX EX expire_seconds
        result = await client.set(key, "consumed", nx=True, ex=expire_seconds)
        if result is True or result == "OK":
            return True
        return False
    except Exception as e:
        logger.error(f"Redis error during atomic token consumption: {type(e).__name__}")
        raise RedisUnavailableError(f"Redis operation failed: {type(e).__name__}") from e


async def is_token_blacklisted(token: str) -> bool:
    """
    Checks if a token's SHA-256 hash exists in the Redis revocation store.
    Returns True if blacklisted, False if not blacklisted or if Redis is unavailable.
    No in-memory fallback is used in production.
    """
    client = await get_redis_client()
    if not client:
        return False

    token_hash = hash_token(token)
    try:
        val = await client.get(f"revoked:token:{token_hash}")
        return val is not None
    except Exception as e:
        logger.error(f"Redis query error during revocation check: {type(e).__name__}")
        return False


async def check_rate_limit(key: str, max_requests: int = 100, window_seconds: int = 60) -> tuple[bool, int]:
    client = await get_redis_client()
    if not client:
        return True, max_requests

    try:
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, window_seconds)
        if current > max_requests:
            ttl = await client.ttl(key)
            return False, max(ttl, 1)
        return True, 0
    except Exception as e:
        logger.error(f"Rate limiting Redis failure: {type(e).__name__}")
        return True, 0
