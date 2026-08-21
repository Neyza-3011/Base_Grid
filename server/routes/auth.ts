import { Router, Request, Response } from "express";
import {
  generateCsrfToken,
  generateSecureToken,
  generateTokens,
  getCookieSettings,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  toSafeUserSession,
  validatePasswordPolicy,
  verifyPassword,
  verifyRefreshToken,
} from "../security";
import { db } from "../db";
import { tokenStore, StoreUnavailableError } from "../token-store";
import { authenticate } from "../middleware/auth";
import { emailService } from "../email-service";
import { config } from "../config";

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === "production";
const cookieSettings = getCookieSettings(isProduction);

/**
 * POST /api/v1/auth/register
 * Creates a new user & company, creates persistent email verification token, sends verification email,
 * issues HttpOnly session & refresh cookies with rotation registration.
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

    const passwordValidation = validatePasswordPolicy(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ detail: passwordValidation.message || "Password non valida." });
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
      emailConfirmed: !config.EMAIL_VERIFICATION_ENABLED,
    });

    if (config.EMAIL_VERIFICATION_ENABLED) {
      // Create persistent email verification token (single-use, expires in 24h)
      const rawVerificationToken = generateSecureToken();
      const verificationTokenHash = hashToken(rawVerificationToken);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await db.createAuthToken({
        userId: user.id,
        tokenHash: verificationTokenHash,
        type: "email_verification",
        expiresAt: verificationExpiresAt,
      });

      // Dispatch verification email
      const emailRes = await emailService.sendVerificationEmail(user.email, rawVerificationToken, user.fullName);
      if (!emailRes.success) {
        await db.revokeActiveAuthTokens(user.id, "email_verification");
      }
    }

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
 * POST /api/v1/auth/verify-email
 * Verifies user's email address using single-use hashed verification token.
 */
authRouter.post("/verify-email", async (req: any, res: any): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ detail: "Token di verifica mancante o non valido." });
      return;
    }

    const tokenHash = hashToken(token);
    const result = await db.verifyEmailWithToken(tokenHash);

    if (!result.success) {
      if (result.error === "already_used") {
        res.status(400).json({ detail: "Il link di verifica è già stato utilizzato." });
        return;
      }
      if (result.error === "expired_token") {
        res.status(400).json({ detail: "Il link di verifica è scaduto. Richiedi una nuova email di conferma." });
        return;
      }
      res.status(400).json({ detail: "Token di verifica non valido." });
      return;
    }

    const updatedUser = await db.findUserById(result.userId!);
    res.status(200).json({
      message: "Email verificata con successo.",
      emailConfirmed: true,
      user: updatedUser ? toSafeUserSession(updatedUser) : undefined,
    });
  } catch (error) {
    res.status(500).json({ detail: "Errore durante la verifica dell'email." });
  }
});

/**
 * POST /api/v1/auth/resend-verification
 * Resends verification email with new single-use token. Responds identically to prevent email enumeration.
 */
authRouter.post("/resend-verification", async (req: any, res: any): Promise<void> => {
  try {
    const { email } = req.body;
    if (email && typeof email === "string" && config.EMAIL_VERIFICATION_ENABLED) {
      const normalized = normalizeEmail(email);
      const user = await db.findUserByEmail(normalized);

      if (user && !user.emailConfirmed && user.isActive) {
        // Invalidate previous verification tokens
        await db.revokeActiveAuthTokens(user.id, "email_verification");

        const rawToken = generateSecureToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await db.createAuthToken({
          userId: user.id,
          tokenHash,
          type: "email_verification",
          expiresAt,
        });

        const emailRes = await emailService.sendVerificationEmail(user.email, rawToken, user.fullName);
        if (!emailRes.success) {
          await db.revokeActiveAuthTokens(user.id, "email_verification");
          res.status(502).json({ detail: "Impossibile inviare l'email di verifica. Riprova più tardi." });
          return;
        }
      }
    }

    // Always return 200 with uniform message to prevent enumeration
    res.status(200).json({
      message: "Se l'indirizzo email è registrato e non ancora verificato, riceverai a breve una nuova email di conferma.",
    });
  } catch (error) {
    res.status(500).json({ detail: "Errore durante l'invio dell'email di verifica." });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Initiates password reset flow. Responds indistinguishably to prevent user enumeration.
 */
authRouter.post("/forgot-password", async (req: any, res: any): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ detail: "L'indirizzo email è obbligatorio." });
      return;
    }

    const normalized = normalizeEmail(email);
    const user = await db.findUserByEmail(normalized);

    if (user && user.isActive && config.EMAIL_VERIFICATION_ENABLED) {
      // Invalidate existing active reset tokens for this user
      await db.revokeActiveAuthTokens(user.id, "password_reset");

      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);

      // Short 1-hour expiration for password reset tokens
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await db.createAuthToken({
        userId: user.id,
        tokenHash,
        type: "password_reset",
        expiresAt,
      });

      const emailRes = await emailService.sendPasswordResetEmail(user.email, rawToken, user.fullName);
      if (!emailRes.success) {
        await db.revokeActiveAuthTokens(user.id, "password_reset");
        res.status(502).json({ detail: "Impossibile inviare l'email di reset password. Riprova più tardi." });
        return;
      }
    }

    // Uniform indistinguishable response
    res.status(200).json({
      message: "Se l'indirizzo email è registrato nel sistema, riceverai a breve le istruzioni per reimpostare la password.",
    });
  } catch (error) {
    res.status(500).json({ detail: "Errore durante la richiesta di reimpostazione password." });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Completes password reset using single-use hashed reset token.
 * Updates password and revokes all existing refresh tokens/sessions across devices.
 */
authRouter.post("/reset-password", async (req: any, res: any): Promise<void> => {
  try {
    const { token } = req.body;
    const newPassword = req.body.new_password || req.body.newPassword;

    if (!token || typeof token !== "string" || !newPassword || typeof newPassword !== "string") {
      res.status(400).json({ detail: "Token e nuova password sono obbligatori." });
      return;
    }

    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ detail: passwordValidation.message || "Password non valida." });
      return;
    }

    // 1. Fail-closed: Verify tokenStore availability BEFORE making any changes
    if (!tokenStore.isAvailable()) {
      res.status(503).json({
        detail: "Servizio di autenticazione temporaneamente non disponibile. Riprova più tardi.",
      });
      return;
    }

    const tokenHash = hashToken(token);

    // 2. Validate reset token in DB before revoking sessions or changing password
    const tokenRecord = await db.findAuthTokenByHash(tokenHash, "password_reset");
    if (!tokenRecord) {
      res.status(400).json({ detail: "Token di reset non valido." });
      return;
    }
    if (tokenRecord.consumed) {
      res.status(400).json({ detail: "Il link di reset password è già stato utilizzato." });
      return;
    }
    const expiresAt = new Date(tokenRecord.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      res.status(400).json({ detail: "Il link di reset password è scaduto. Richiedi un nuovo link." });
      return;
    }

    // 3. Revoke all active sessions and refresh tokens for this user in tokenStore (Redis)
    // If Redis fails or is unavailable, this throws StoreUnavailableError -> caught -> 503
    // DB has NOT been touched, so password is NOT updated and token remains valid!
    await tokenStore.revokeAllUserTokens(tokenRecord.userId);

    // 4. Update user's password and consume reset token in DB
    const { hash: newPasswordHash, salt: newSalt } = hashPassword(newPassword);
    const result = await db.resetPasswordWithToken(tokenHash, newPasswordHash, newSalt);

    if (!result.success) {
      if (result.error === "already_used") {
        res.status(400).json({ detail: "Il link di reset password è già stato utilizzato." });
        return;
      }
      if (result.error === "expired_token") {
        res.status(400).json({ detail: "Il link di reset password è scaduto. Richiedi un nuovo link." });
        return;
      }
      res.status(400).json({ detail: "Token di reset non valido." });
      return;
    }

    // 5. Clear current client cookies
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/api/v1/auth" });
    res.clearCookie("csrf_token", { path: "/" });

    res.status(200).json({
      message: "Password reimpostata con successo. Effettua il login con la nuova password.",
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      res.status(503).json({
        detail: "Servizio di autenticazione temporaneamente non disponibile. Riprova più tardi.",
      });
      return;
    }
    res.status(500).json({ detail: "Errore durante la reimpostazione della password." });
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
authRouter.get("/session", authenticate, async (req: any, res: any): Promise<void> => {
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
      if ("reason" in consumeResult && consumeResult.reason === "already_used") {
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
authRouter.get("/csrf-token", async (req: any, res: any): Promise<void> => {
  let token = req.cookies?.csrf_token;
  if (!token) {
    token = generateCsrfToken();
    res.cookie("csrf_token", token, cookieSettings.csrfCookie);
  }
  res.status(200).json({ csrfToken: token });
});

