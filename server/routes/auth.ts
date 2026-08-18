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
import { tokenStore, StoreUnavailableError } from "../token-store";
import { authenticate } from "../middleware/auth";

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
const cookieSettings = getCookieSettings(isProduction);

/**
 * POST /api/v1/auth/register
 * Creates a new user & company. Issues HttpOnly session & refresh cookies with rotation registration.
 */
authRouter.post("/register", async (req: any, res: any): Promise<void> => {
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
    const existing = await db.findUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ detail: "Email già registrata nel sistema. Effettua il login." });
      return;
    }

    const { user } = await db.createUser({
      email: normalizedEmail,
      fullName: full_name,
      password,
      companyName: company_name,
      phoneNumber: phone_number,
    });

    const { accessToken, refreshToken, jti, familyId } = generateTokens(user);
    await tokenStore.registerToken({
      token: refreshToken,
      jti,
      userId: user.id,
      familyId,
    });

    const csrfToken = generateCsrfToken();

    // Set secure HttpOnly cookies
    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    // Return safe user session (NO tokens in response body)
    res.status(201).json(toSafeUserSession(user));
  } catch (error: any) {
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({ detail: "Servizio di autenticazione temporaneamente non disponibile." });
      return;
    }
    res.status(500).json({ detail: "Errore interno durante la registrazione." });
  }
});

/**
 * POST /api/v1/auth/login
 * Validates credentials, registers fresh refresh token, issues HttpOnly cookies, returns safe user session.
 */
authRouter.post("/login", async (req: any, res: any): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ detail: "Email e password sono obbligatorie." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await db.findUserByEmail(normalizedEmail);

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

    const { accessToken, refreshToken, jti, familyId } = generateTokens(user);
    await tokenStore.registerToken({
      token: refreshToken,
      jti,
      userId: user.id,
      familyId,
    });

    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({ detail: "Servizio di autenticazione temporaneamente non disponibile." });
      return;
    }
    res.status(500).json({ detail: "Errore interno del server durante il login." });
  }
});

/**
 * GET /api/v1/auth/session
 * Server-authoritative session identification using verified access_token cookie.
 */
authRouter.get("/session", authenticate, async (req: any, res: any): void => {
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
 * Single-Use Refresh Token rotation with atomic consumption, replay attack detection, and fail-closed storage handling.
 */
authRouter.post("/refresh", async (req: any, res: any): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ detail: "Refresh token mancante o sessione scaduta." });
      return;
    }

    // Fail-Closed check: if token storage is unavailable, refuse token issuance and return 503
    if (!tokenStore.isAvailable()) {
      res.status(503).json({
        detail: "Servizio di autenticazione temporaneamente non disponibile. Riprova più tardi.",
      });
      return;
    }

    // Verify JWT cryptographic signature, expiry, and tokenType
    const payload = verifyRefreshToken(refreshToken);
    if (!payload || !payload.sub || payload.tokenType !== "refresh") {
      res.status(401).json({ detail: "Refresh token non valido o scaduto." });
      return;
    }

    // Verify user exists and is active
    const user = await db.findUserById(payload.sub);
    if (!user || !user.isActive) {
      res.status(401).json({ detail: "Utente non trovato o account disattivato." });
      return;
    }

    // Atomic single-use consumption: detects reuse and invalidates compromised families
    const consumeResult = await tokenStore.consumeToken(refreshToken);
    if (!consumeResult.success) {
      if (consumeResult.reason === "already_used") {
        res.status(401).json({
          detail: "Refresh token già utilizzato. Rilevato potenziale tentativo di replay.",
        });
        return;
      }
      res.status(401).json({ detail: "Refresh token non valido, scaduto o revocato." });
      return;
    }

    // Issue new access token + new rotated refresh token belonging to the same lineage family
    const { accessToken, refreshToken: newRefreshToken, jti: newJti } = generateTokens(user, {
      familyId: consumeResult.familyId,
    });

    // Register new refresh token in store
    await tokenStore.registerToken({
      token: newRefreshToken,
      jti: newJti,
      userId: user.id,
      familyId: consumeResult.familyId,
    });

    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", newRefreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({
        detail: "Servizio di autenticazione temporaneamente non disponibile. Riprova più tardi.",
      });
      return;
    }
    res.status(500).json({ detail: "Errore durante il rinnovo della sessione." });
  }
});

/**
 * POST /api/v1/auth/logout
 * Atomically revokes refresh token in persistent store and clears HttpOnly cookies.
 */
authRouter.post("/logout", async (req: any, res: any): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken && tokenStore.isAvailable()) {
      await tokenStore.revokeToken(refreshToken);
    }
  } catch {
    // Fail-safe: cookie clearance must proceed regardless
  }

  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/api/v1/auth" });
  res.clearCookie("csrf_token", { path: "/" });

  res.status(200).json({ message: "Logout effettuato con successo." });
});

/**
 * POST /api/v1/auth/google
 * Server-authoritative Google OAuth authentication with token store registration.
 */
authRouter.post("/google", async (req: any, res: any): Promise<void> => {
  try {
    const { email, fullName, companyName } = req.body;

    if (!email || !fullName) {
      res.status(400).json({ detail: "Dati profilo Google mancanti (email e nome)." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const { user } = await db.createGoogleUser({
      email: normalizedEmail,
      fullName,
      companyName,
    });

    if (!user.isActive) {
      res.status(401).json({ detail: "Account disattivato." });
      return;
    }

    const { accessToken, refreshToken, jti, familyId } = generateTokens(user);
    await tokenStore.registerToken({
      token: refreshToken,
      jti,
      userId: user.id,
      familyId,
    });

    const csrfToken = generateCsrfToken();

    res.cookie("access_token", accessToken, cookieSettings.accessCookie);
    res.cookie("refresh_token", refreshToken, cookieSettings.refreshCookie);
    res.cookie("csrf_token", csrfToken, cookieSettings.csrfCookie);

    res.status(200).json(toSafeUserSession(user));
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({ detail: "Servizio di autenticazione temporaneamente non disponibile." });
      return;
    }
    res.status(500).json({ detail: "Errore durante l'autenticazione Google." });
  }
});

/**
 * GET /api/v1/auth/csrf-token
 * Issues/returns current CSRF token cookie for frontend clients.
 */
authRouter.get("/csrf-token", async (req: any, res: any): void => {
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = generateCsrfToken();
    res.cookie("csrf_token", token, cookieSettings.csrfCookie);
  }
  res.status(200).json({ csrfToken: token });
});

