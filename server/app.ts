import express, { Express, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { companyRouter } from "./routes/company";
import { adminRouter } from "./routes/admin";
import { reportsRouter } from "./routes/reports";
import { verifyCsrf } from "./middleware/auth";
import { assertValidJwtSecret } from "./security";
import { config } from "./config";

export function createApp(): Express {
  // Validate JWT Secret configuration on application initialization / startup
  assertValidJwtSecret();

  const app = express();

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

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "BaseGrid Server-Authoritative Backend",
    });
  });

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
    
    // Log the error safely (do not expose secrets in logs; only the error name/message)
    console.error(`[ServerError] ${err.name || "Error"}:`, err.message || err);
    
    // Only return the exact error message to the client for expected HTTP errors (status < 500)
    // For 500 Internal Server Errors, always mask the underlying cause to prevent leakage.
    const safeMessage = status < 500 
      ? (err.message || "Richiesta non valida.") 
      : "Errore interno del server.";

    res.status(status).json({ detail: safeMessage });
  });

  return app;
}
