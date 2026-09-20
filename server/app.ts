import express, { Express, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { companyRouter } from "./routes/company";
import { adminRouter } from "./routes/admin";
import { reportsRouter } from "./routes/reports";
import { verifyCsrf } from "./middleware/auth";
import { securityHeaders } from "./middleware/security-headers";
import { assertValidJwtSecret } from "./security";
import { config } from "./config";
import { generalApiLimiter } from "./rate-limiter";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { asyncHandler } from "./async-handler";

export function createApp(): Express {
  // Validate JWT Secret configuration on application initialization / startup
  assertValidJwtSecret();

  const app = express();
  
  // Disable X-Powered-By header to avoid framework disclosure
  app.disable("x-powered-by");

  // Trust the first proxy to safely use req.ip for rate limiting in production (e.g. Render/Cloud Run)
  app.set("trust proxy", 1);

  // Centralized HTTP Security Headers middleware (applied to API, health, and frontend routes)
  app.use(securityHeaders);

  // Basic security and parsing middlewares
  app.use(
    cors({
      origin: config.NODE_ENV === "production" ? config.CORS_ORIGINS : true, // Restrict in production
      credentials: true, // Allow cookies
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Global CSRF verification middleware for state-changing requests
  app.use(verifyCsrf);

  // Liveness check (process alive) - does NOT require DB or Redis
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "BaseGrid Server-Authoritative Backend",
    });
  });

  // Readiness check (PostgreSQL + Redis available) - fails closed (503) if any critical dependency is down
  app.get(
    "/ready",
    asyncHandler(async (_req: Request, res: Response) => {
      const isProd = process.env.NODE_ENV === "production" || config.NODE_ENV === "production";

      // In production, DATABASE_URL and REDIS_URL/REDIS_HOST are strictly required
      if (isProd) {
        if (!config.DATABASE_URL || (!config.REDIS_URL && config.REDIS_HOST === "127.0.0.1")) {
          res.status(503).json({ status: "not_ready" });
          return;
        }
      }

      try {
        const [dbOk, redisOk] = await Promise.all([
          db.ping(2000).catch(() => false),
          tokenStore.ping(2000).catch(() => false),
        ]);

        if (dbOk && redisOk) {
          res.status(200).json({ status: "ready" });
        } else {
          res.status(503).json({ status: "not_ready" });
        }
      } catch {
        res.status(503).json({ status: "not_ready" });
      }
    }),
  );

  // Apply general API rate limiter to all /api routes
  app.use("/api", generalApiLimiter);

  // API V1 Routes
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/company", companyRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/reports", reportsRouter);

  // 404 for unhandled API endpoints
  app.use("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ detail: "Endpoint API non trovato." });
  });

  // Centralized safe error handler (never leaks stack traces or internal secrets)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    
    // Log the error safely (do not expose secrets in logs for 500s)
    if (status >= 500) {
      console.error(`[ServerError] ${err.name || "Error"}: Internal Server Error (ID: ${crypto.randomUUID()})`);
    } else {
      console.error(`[ServerError] ${err.name || "Error"}:`, err.message || err);
    }
    
    // Only return the exact error message to the client for expected HTTP errors (status < 500)
    // For 500 Internal Server Errors, always mask the underlying cause to prevent leakage.
    const safeMessage = status < 500 
      ? (err.message || "Richiesta non valida.") 
      : "Errore interno del server.";

    res.status(status).json({ detail: safeMessage });
  });

  return app;
}
