import { Router, Request, Response } from "express";
import {
  generateCsrfToken,
  generateTokens,
  getCookieSettings,
  isValidEmail,
  normalizeEmail,
  toSafeUserSession,
  verifyPassword,
  verifyRefreshToken,
} from "../security";
import { db } from "../db";
import { authenticate } from "../middleware/auth";

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
const cookieSettings = getCookieSettings(isProduction);

/**
 * POST /api/v1/auth/register
 * Creates a new user & company. Issues HttpOnly session & refresh cookies.
 */
authRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, company_name, phone_number } = req.body;

    if (!email || !password || !full_name || !company_name) {
      res.status(400).json({
        detail: "Campi obbligatori mancanti: email, password, full_name e company_name sono richiesti.",
      });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json({ detail: "Formato email non valido." });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ detail: "La password deve contenere almeno 8 caratteri." });
      return;
    }

    // Check email uniqueness
    const existing = db.findUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ detail: "Email già registrata nel sistema. Effettua il login." });
      return;
    }

    const { user } = db.createUser({
      email: normalizedEmail,
      fullName: full_name,
      password,
      companyName: company_name,
      phoneNumber: phone_number,
    });

    const { accessToken, refreshToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();

    // Set secure HttpOnly cookies
    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    // Return safe user session (NO tokens in response body)
    res.status(201).json(toSafeUserSession(user));
  } catch (error: any) {
    res.status(500).json({ detail: "Errore interno durante la registrazione." });
  }
});

/**
 * POST /api/v1/auth/login
 * Validates credentials, issues HttpOnly cookies, returns safe user session.
 */
authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ detail: "Email e password sono obbligatorie." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = db.findUserByEmail(normalizedEmail);

    if (!user) {
      // Use uniform 401 to prevent user enumeration
      res.status(401).json({ detail: "Email o password non corretti." });
      return;
    }

    const valid = verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      res.status(401).json({ detail: "Email o password non corretti." });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ detail: "Account disattivato. Contatta l'amministratore." });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch {
    res.status(500).json({ detail: "Errore interno del server durante il login." });
  }
});

/**
 * GET /api/v1/auth/session
 * Server-authoritative session identification using verified access_token cookie.
 */
authRouter.get("/session", authenticate, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Sessione non valida." });
    return;
  }

  // Refresh CSRF token on session check if missing
  if (!req.cookies?.csrf_token) {
    const csrfToken = generateCsrfToken();
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);
  }

  res.status(200).json(toSafeUserSession(req.user));
});

/**
 * POST /api/v1/auth/refresh
 * Refresh Token rotation: exchanges a valid refresh_token for a fresh access_token & new refresh_token.
 */
authRouter.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ detail: "Refresh token mancante o sessione scaduta." });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload || !payload.sub) {
      res.status(401).json({ detail: "Refresh token non valido o scaduto." });
      return;
    }

    const user = db.findUserById(payload.sub);
    if (!user || !user.isActive) {
      res.status(401).json({ detail: "Utente non trovato o disattivato." });
      return;
    }

    // Token rotation
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", newRefreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch {
    res.status(500).json({ detail: "Errore durante il rinnovo della sessione." });
  }
});

/**
 * POST /api/v1/auth/logout
 * Clears HttpOnly cookies with identical security options.
 */
authRouter.post("/logout", (req: Request, res: Response): void => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
  res.clearCookie("csrf_token", { path: "/" });

  res.status(200).json({ message: "Logout effettuato con successo." });
});

/**
 * POST /api/v1/auth/google
 * Server-authoritative Google OAuth authentication.
 */
authRouter.post("/google", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName, companyName } = req.body;

    if (!email || !fullName) {
      res.status(400).json({ detail: "Dati profilo Google mancanti (email e nome)." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const { user } = db.createGoogleUser({
      email: normalizedEmail,
      fullName,
      companyName,
    });

    if (!user.isActive) {
      res.status(401).json({ detail: "Account disattivato." });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch {
    res.status(500).json({ detail: "Errore durante l'autenticazione Google." });
  }
});

/**
 * GET /api/v1/auth/csrf-token
 * Issues/returns current CSRF token cookie for frontend clients.
 */
authRouter.get("/csrf-token", (req: Request, res: Response): void => {
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = generateCsrfToken();
    res.cookie("csrf_token", token, cookieSettings.csrfCookie);
  }
  res.status(200).json({ csrfToken: token });
});
