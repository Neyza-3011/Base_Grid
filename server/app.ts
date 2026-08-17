import express, { Express, Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { companyRouter } from "./routes/company";
import { adminRouter } from "./routes/admin";
import { reportsRouter } from "./routes/reports";
import { verifyCsrf } from "./middleware/auth";

export function createApp(): Express {
  const app = express();

  // Basic security and parsing middlewares
  app.use(
    cors({
      origin: true, // Allow frontend origin
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
    console.error("[ServerError]", err?.message || err);
    res.status(err.status || 500).json({
      detail: err.message || "Errore interno del server.",
    });
  });

  return app;
}
