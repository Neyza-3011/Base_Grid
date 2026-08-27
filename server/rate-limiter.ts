import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { config } from "./config";
import crypto from "crypto";

export interface RateLimiterConfig {
  points: number;
  duration: number; // in seconds
  keyPrefix?: string;
  errorMessage?: string;
  failClosed?: boolean; // Default to true for critical endpoints
}

class RateLimiter {
  private redisClient: Redis | null = null;
  private localFallback = new Map<string, { count: number; expiresAt: number }>();

  constructor() {
    if (config.REDIS_URL || config.REDIS_HOST !== "127.0.0.1") {
      const options = {
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      };
      if (config.REDIS_URL) {
        this.redisClient = new Redis(config.REDIS_URL, options);
      } else {
        this.redisClient = new Redis({
          host: config.REDIS_HOST,
          port: config.REDIS_PORT,
          ...options,
        });
      }
    } else {
      if (config.NODE_ENV === "production") {
        throw new Error("CRITICAL SECURITY ERROR: Distributed Rate Limiting requires REDIS_URL in production.");
      }
    }
  }

  private getClientIp(req: Request): string {
    return req.ip || req.socket.remoteAddress || "unknown";
  }

  public middleware(configOpts: RateLimiterConfig, keyGenerator?: (req: Request) => string) {
    const { points, duration, failClosed = true } = configOpts;

    return async (req: Request, res: Response, next: NextFunction) => {
      // Bypass rate limiting in test environment by default to avoid breaking existing test suites,
      // unless specifically testing the rate limiter (signaled by a custom header).
      const isTestEnv = config.NODE_ENV === "test" || process.env.NODE_ENV === "test" || process.env.VITEST === "true";
      if (isTestEnv && req.headers["x-test-ratelimit"] !== "enable") {
        return next();
      }

      let key = keyGenerator ? keyGenerator(req) : this.getClientIp(req);
      if (configOpts.keyPrefix) {
        key = `${configOpts.keyPrefix}:${key}`;
      }
      key = `ratelimit:${key}`;

      try {
        if (this.redisClient && (this.redisClient.status === 'ready' || this.redisClient.status === 'connect' || this.redisClient.status === 'connecting' || this.redisClient.status === 'wait')) {
          const luaScript = `
            local current = redis.call("INCR", KEYS[1])
            if current == 1 then
              redis.call("EXPIRE", KEYS[1], ARGV[1])
            end
            local ttl = redis.call("TTL", KEYS[1])
            return {current, ttl}
          `;
          const result = await this.redisClient.eval(luaScript, 1, key, duration) as [number, number];
          const current = result[0];
          let ttl = result[1];
          if (ttl < 0) ttl = duration;

          res.setHeader("X-RateLimit-Limit", String(points));
          res.setHeader("X-RateLimit-Remaining", String(Math.max(0, points - current)));

          if (current > points) {
            res.setHeader("Retry-After", String(ttl));
            res.status(429).json({
              detail: configOpts.errorMessage || "Troppe richieste. Riprova più tardi.",
            });
            return;
          }
        } else {
          // Fallback logic
          if (config.NODE_ENV === "production") {
            if (failClosed) {
              res.status(503).json({ detail: "Servizio temporaneamente non disponibile (RL-1)." });
              return;
            }
          } else {
            // Memory fallback for development and testing
            const now = Date.now();
            let entry = this.localFallback.get(key);
            if (!entry || entry.expiresAt <= now) {
              entry = { count: 0, expiresAt: now + duration * 1000 };
            }
            entry.count++;
            this.localFallback.set(key, entry);

            res.setHeader("X-RateLimit-Limit", String(points));
            res.setHeader("X-RateLimit-Remaining", String(Math.max(0, points - entry.count)));

            if (entry.count > points) {
              const ttl = Math.ceil((entry.expiresAt - now) / 1000);
              res.setHeader("Retry-After", String(ttl));
              res.status(429).json({
                detail: configOpts.errorMessage || "Troppe richieste. Riprova più tardi.",
              });
              return;
            }
          }
        }
      } catch (err) {
        if (failClosed) {
          res.status(503).json({ detail: "Servizio temporaneamente non disponibile (RL-2)." });
          return;
        }
      }

      next();
    };
  }
  public async getRedisClient(): Promise<Redis | null> {
    if (this.redisClient) {
      try {
        if (this.redisClient.status === "wait") {
          await this.redisClient.connect().catch(() => {});
        }
      } catch (err) {}
    }
    return this.redisClient;
  }

  public close() {
    if (this.redisClient) {
      this.redisClient.quit();
    }
  }
}

export const rateLimiter = new RateLimiter();

// Optional helper class for distributed testing in the same process
export class TestRateLimiter extends RateLimiter {}

export function getEmailHashKey(req: Request): string {
  const email = req.body?.email;
  if (!email || typeof email !== "string") {
    return rateLimiter["getClientIp"](req);
  }
  const normalized = email.toLowerCase().trim();
  // Hash email to avoid leaking PII in Redis keys
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export const loginLimiter = rateLimiter.middleware({
  points: 10,
  duration: 15 * 60, // 15 minutes
  keyPrefix: "rl:login",
  errorMessage: "Troppi tentativi di accesso. Riprova tra 15 minuti.",
});

export const loginAccountLimiter = rateLimiter.middleware({
  points: 10,
  duration: 15 * 60, // 15 minutes per account
  keyPrefix: "rl:login:acct",
  errorMessage: "Troppi tentativi di accesso per questo account. Riprova tra 15 minuti.",
}, getEmailHashKey);

export const registerLimiter = rateLimiter.middleware({
  points: 5,
  duration: 60 * 60, // 1 hour
  keyPrefix: "rl:register",
  errorMessage: "Troppe registrazioni da questo IP. Riprova più tardi.",
});

export const refreshLimiter = rateLimiter.middleware({
  points: 20,
  duration: 60, // 1 minute
  keyPrefix: "rl:refresh",
  errorMessage: "Troppi tentativi di refresh. Riprova tra un minuto.",
  failClosed: true, // MUST fail closed for security (refresh is sensitive and tokenStore is already fail-closed)
});

export const forgotPasswordLimiter = rateLimiter.middleware({
  points: 3,
  duration: 60 * 60, // 1 hour
  keyPrefix: "rl:forgot-password",
  errorMessage: "Troppe richieste di reset password. Riprova più tardi.",
});

export const resetPasswordLimiter = rateLimiter.middleware({
  points: 5,
  duration: 60 * 60, // 1 hour
  keyPrefix: "rl:reset-password",
  errorMessage: "Troppi tentativi di reset. Riprova più tardi.",
});

export const googleAuthLimiter = rateLimiter.middleware({
  points: 10,
  duration: 15 * 60, // 15 minutes
  keyPrefix: "rl:google",
  errorMessage: "Troppi tentativi di accesso. Riprova tra 15 minuti.",
});

export const generalApiLimiter = rateLimiter.middleware({
  points: 1000,
  duration: 5 * 60, // 1000 requests per 5 minutes per IP
  keyPrefix: "rl:api",
  errorMessage: "Troppe richieste al sistema. Riprova più tardi.",
  failClosed: false, // Don't block general API usage if Redis goes down, to allow health checks and degraded functionality
});
