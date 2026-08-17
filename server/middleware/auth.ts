import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../security";
import { db } from "../db";
import { CompanyRecord, UserRecord, UserRole } from "../types";

// Extend Express Request interface to include authenticated user and company
declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      company?: CompanyRecord;
    }
  }
}

/**
 * Authentication Middleware:
 * Strictly server-authoritative. Reads access_token from HttpOnly cookie,
 * verifies signature, claims, user existence and active status.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;
  if (!token) {
    res.status(401).json({ detail: "Non autenticato o sessione scaduta." });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload || !payload.sub) {
    res.status(401).json({ detail: "Token di sessione non valido o scaduto." });
    return;
  }

  const user = db.findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ detail: "Utente non trovato." });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ detail: "Account disattivato." });
    return;
  }

  const company = db.findCompanyById(user.companyId);
  if (!company) {
    res.status(401).json({ detail: "Azienda associata non trovata." });
    return;
  }

  req.user = user;
  req.company = company;
  next();
}

/**
 * Optional authentication: Populates req.user if valid token present, but doesn't block.
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;
  if (!token) {
    return next();
  }

  const payload = verifyAccessToken(token);
  if (payload && payload.sub) {
    const user = db.findUserById(payload.sub);
    if (user && user.isActive) {
      req.user = user;
      const company = db.findCompanyById(user.companyId);
      if (company) {
        req.company = company;
      }
    }
  }
  next();
}

/**
 * Authorization Middleware: Enforce minimum required role(s)
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ detail: "Non autenticato." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ detail: "Accesso negato: permessi insufficienti per questa operazione." });
      return;
    }

    next();
  };
}

/**
 * Authorization Middleware: Enforce SuperAdmin
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "superadmin") {
    res.status(403).json({ detail: "Area riservata esclusivamente al Master Super-Admin." });
    return;
  }
  next();
}

/**
 * CSRF Protection Middleware:
 * Verifies that mutating requests (POST, PUT, DELETE, PATCH) contain an X-CSRF-Token header
 * matching the csrf_token cookie.
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  // Safe methods do not require CSRF token
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }

  // Exempt unauthenticated/lifecycle auth endpoints (login, register, refresh, logout, google)
  const path = req.path;
  if (
    path === "/api/v1/auth/login" ||
    path === "/api/v1/auth/register" ||
    path === "/api/v1/auth/refresh" ||
    path === "/api/v1/auth/logout" ||
    path === "/api/v1/auth/google"
  ) {
    return next();
  }

  const headerCsrf = req.headers["x-csrf-token"];
  const cookieCsrf = req.cookies?.csrf_token;

  if (!cookieCsrf || !headerCsrf || headerCsrf !== cookieCsrf) {
    res.status(403).json({ detail: "CSRF token mancante o non valido." });
    return;
  }

  next();
}
