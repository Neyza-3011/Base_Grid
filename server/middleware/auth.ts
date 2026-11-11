import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../security";
import { db } from "../db";
import { CompanyRecord, PlatformRole, UserRecord, UserRole } from "../types";
import { asyncHandler } from "../async-handler";
import { config, PLATFORM_CEO_EMAIL } from "../config";
import { isCompanySetupComplete } from "../company-setup";

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
export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

  const user = await db.findUserById(payload.sub);
  if (!user) {
    res.status(401).json({ detail: "Utente non trovato." });
    return;
  }


  if (!user.isActive) {
    res.status(401).json({ detail: "Account disattivato." });
    return;
  }

  if (config.EMAIL_VERIFICATION_ENABLED && !user.emailConfirmed) {
    res.status(403).json({ detail: "Conferma l'indirizzo email prima di accedere." });
    return;
  }

  const tokenAuthVersion = payload.authVersion ?? 0;
  if (tokenAuthVersion !== user.authVersion) {
    res.status(401).json({ detail: "Sessione invalidata per motivi di sicurezza. Effettua nuovamente l'accesso." });
    return;
  }


  const isCanonicalPlatformCeo =
    user.platformRole === "ceo" && user.email.trim().toLowerCase() === PLATFORM_CEO_EMAIL;

  // The tenant-scoped "superadmin" role is not sufficient to establish platform authority.
  // Only the canonical, server-persisted CEO identity may use routes that accept this role.
  if (user.role === "superadmin" && !isCanonicalPlatformCeo) {
    res.status(403).json({ detail: "Accesso negato: identità CEO non valida." });
    return;
  }

  const company = await db.findCompanyById(user.companyId);
  if (!company) {
    res.status(401).json({ detail: "Azienda associata non trovata." });
    return;
  }

  if (company.isActive === false && !isCanonicalPlatformCeo) {
    res.status(403).json({ code: "COMPANY_SUSPENDED", detail: "L'accesso all'azienda è stato sospeso dalla piattaforma." });
    return;
  }

  req.user = user;
  req.company = company;

  // An incomplete tenant may only access the company-settings endpoint to finish setup.
  // Keep session introspection available so the frontend can route the owner to onboarding.
  // The company identity and completion state are derived exclusively from persisted server data.
  const requestPath = `${req.baseUrl}${req.path}`;
  const setupComplete = isCompanySetupComplete(company);
  if (!setupComplete && !isCanonicalPlatformCeo) {
    const isSessionEndpoint = requestPath === "/api/v1/auth/session";
    const isCompanySettingsEndpoint = requestPath === "/api/v1/company/settings";
    if (isCompanySettingsEndpoint && user.role !== "owner") {
      res.status(403).json({ detail: "La configurazione iniziale deve essere completata dal titolare dell'azienda." });
      return;
    }
    if (!isSessionEndpoint && !isCompanySettingsEndpoint) {
      res.status(403).json({
        code: "COMPANY_SETUP_REQUIRED",
        detail: "Completa la configurazione iniziale dell'azienda prima di utilizzare questa funzione.",
      });
      return;
    }
  }

  next();
});

/**
 * Optional authentication: Populates req.user if valid token present, but doesn't block.
 */
export const optionalAuthenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.cookies?.access_token;
  if (!token) {
    return next();
  }

  const payload = verifyAccessToken(token);
  if (payload && payload.sub) {
    const user = await db.findUserById(payload.sub);

    if (user && user.isActive && (!config.EMAIL_VERIFICATION_ENABLED || user.emailConfirmed)) {
      const tokenAuthVersion = payload.authVersion ?? 0;
      if (tokenAuthVersion === user.authVersion) {
        const company = await db.findCompanyById(user.companyId);
        if (company && company.isActive !== false) {
          req.user = user;
          req.company = company;
        }
      }
    }

  }
  next();
});

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
 * Authorization Middleware: Enforce trusted platform-level authority.
 * Platform roles are loaded from the persisted user record, never from JWT/client input.
 */
export function requirePlatformRole(platformRole: PlatformRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.platformRole !== platformRole) {
      res.status(403).json({ detail: "Accesso negato: permessi piattaforma insufficienti." });
      return;
    }

    // CEO authority is bound to the one canonical identity, not merely a mutable DB flag.
    if (
      platformRole === "ceo" &&
      req.user.email.trim().toLowerCase() !== PLATFORM_CEO_EMAIL
    ) {
      res.status(403).json({ detail: "Accesso negato: identità CEO non valida." });
      return;
    }

    next();
  };
}

/**
 * Backward-compatible guard name for existing platform administration routes.
 * Existing superadmin records are migrated to platformRole=ceo.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  return requirePlatformRole("ceo")(req, res, next);
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
    path === "/api/v1/auth/google" ||
    path === "/api/v1/auth/forgot-password" ||
    path === "/api/v1/auth/reset-password" ||
    path === "/api/v1/auth/accept-invite" ||
    path === "/api/v1/auth/invite/accept" ||
    path === "/api/v1/auth/verify-email" ||
    path === "/api/v1/auth/resend-verification"
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
