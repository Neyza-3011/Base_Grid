import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { db } from "../db";
import { generateSecureToken, hashPassword, hashToken, isValidEmail, normalizeEmail, toSafeUserSession, verifyPassword, validatePasswordPolicy } from "../security";
import { tokenStore } from "../token-store";
import { asyncHandler } from "../async-handler";
import { TeamService } from "../services/team.service";
import { TEAM_ADMIN_ROLES } from "../types";
import { config, PLATFORM_CEO_EMAIL } from "../config";
import { emailService } from "../email-service";

export const usersRouter = Router();
const teamService = new TeamService(db);

/**
 * GET /api/v1/users/me
 * Returns current authenticated user
 */
usersRouter.get("/me", authenticate, (req: any, res: any): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  res.status(200).json(toSafeUserSession(req.user));
});

/**
 * PUT /api/v1/users/me
 * Updates current authenticated user profile
 */
usersRouter.put("/me", authenticate, asyncHandler(async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ detail: "I dati inviati non sono validi." });
    return;
  }

  const { full_name, email, password, current_password, phone_number } = req.body;
  const updates: any = {};

  if (full_name !== undefined) {
    if (typeof full_name !== "string" || full_name.trim().length < 2 || full_name.trim().length > 100) {
      res.status(400).json({ detail: "Nome non valido. Deve essere tra 2 e 100 caratteri." });
      return;
    }
    updates.fullName = full_name.trim();
  }

  let emailChanged = false;
  if (email !== undefined) {
    if (typeof email !== "string") {
      res.status(400).json({ detail: "Formato email non valido." });
      return;
    }
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      res.status(400).json({ detail: "Formato email non valido." });
      return;
    }

    const currentEmail = normalizeEmail(req.user.email);
    const isCanonicalPlatformCeo =
      req.user.platformRole === "ceo" && currentEmail === PLATFORM_CEO_EMAIL;
    if (normalized !== currentEmail && isCanonicalPlatformCeo) {
      res.status(403).json({
        detail: "L'email dell'identità CEO della piattaforma non può essere modificata da questa route.",
      });
      return;
    }

    // If email is changing, ensure uniqueness
    if (normalized !== currentEmail) {
      const existing = await db.findUserByEmail(normalized);
      if (existing) {
        res.status(409).json({ detail: "Questa email è già in uso da un altro utente." });
        return;
      }
      updates.email = normalized;
      emailChanged = true;
      if (config.EMAIL_VERIFICATION_ENABLED) {
        updates.emailConfirmed = false;
      }
    }
  }

  if (password !== undefined) {
    if (typeof password !== "string") {
      res.status(400).json({ detail: "Password non valida." });
      return;
    }
    if (!current_password || typeof current_password !== "string") {
      res.status(400).json({ detail: "La password corrente è obbligatoria per impostare una nuova password." });
      return;
    }

    const currentUser = await db.findUserById(req.user.id);
    if (!currentUser || !currentUser.passwordHash || !currentUser.salt) {
      res.status(401).json({ detail: "Utente non trovato o configurazione non valida." });
      return;
    }

    if (!verifyPassword(current_password, currentUser.passwordHash, currentUser.salt)) {
      res.status(401).json({ detail: "Password corrente non corretta." });
      return;
    }

    const passValidation = validatePasswordPolicy(password);
    if (!passValidation.valid) {
      res.status(400).json({ detail: passValidation.message });
      return;
    }

    if (!tokenStore.isAvailable()) {
      res.status(503).json({ detail: "Servizio di sicurezza temporaneamente non disponibile per la revoca delle sessioni." });
      return;
    }

    try {
      await tokenStore.revokeAllUserTokens(req.user.id);
    } catch (err) {
      res.status(503).json({ detail: "Impossibile revocare le sessioni. Modifica password annullata." });
      return;
    }

    const { hash, salt } = hashPassword(password);
    updates.passwordHash = hash;
    updates.salt = salt;
  }

  if (phone_number !== undefined) {
    if (typeof phone_number !== "string" || phone_number.trim().length > 20) {
      res.status(400).json({ detail: "Numero di telefono non valido." });
      return;
    }
    updates.phoneNumber = phone_number.trim();
  }

  if (emailChanged && config.EMAIL_VERIFICATION_ENABLED) {
    if (!tokenStore.isAvailable()) {
      res.status(503).json({ detail: "Servizio di sicurezza temporaneamente non disponibile per la revoca delle sessioni." });
      return;
    }
  }

  try {
    let updatedUser;

    if (password && typeof password === "string") {
      // Atomic: password + authVersion + any profile fields in a single DB operation
      const profileUpdates: Partial<Pick<import("../types").UserRecord, "fullName" | "email" | "phoneNumber" | "emailConfirmed">> = {};
      if (updates.fullName !== undefined) profileUpdates.fullName = updates.fullName;
      if (updates.email !== undefined) profileUpdates.email = updates.email;
      if (updates.phoneNumber !== undefined) profileUpdates.phoneNumber = updates.phoneNumber;
      if (updates.emailConfirmed !== undefined) profileUpdates.emailConfirmed = updates.emailConfirmed;

      updatedUser = await db.updatePasswordAndIncrementAuthVersion(
        req.user.id,
        updates.passwordHash,
        updates.salt,
        Object.keys(profileUpdates).length > 0 ? profileUpdates : undefined,
      );

      if (!updatedUser) {
        res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
        return;
      }
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/api/v1/auth" });
      res.clearCookie("csrf_token", { path: "/" });
    } else {
      // Profile-only update: no password change
      if (Object.keys(updates).length === 0) {
        res.status(200).json(toSafeUserSession(req.user));
        return;
      }
      updatedUser = emailChanged && config.EMAIL_VERIFICATION_ENABLED
        ? await db.updateUserAndIncrementAuthVersion(req.user.id, updates)
        : await db.updateUser(req.user.id, updates);
      if (!updatedUser) {
        res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
        return;
      }
    }

    if (emailChanged && config.EMAIL_VERIFICATION_ENABLED && updates.email) {
      // The email update above atomically incremented authVersion. Clear browser cookies
      // before any fallible verification-token/database/provider operations.
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/api/v1/auth" });
      res.clearCookie("csrf_token", { path: "/" });

      try {
        try {
          await tokenStore.revokeAllUserTokens(req.user.id);
        } catch {
          // The persisted authVersion increment already invalidates existing access JWTs.
          // Keep the log generic; never expose provider or token-store error details.
          console.error("[UsersRouter] Failed to revoke active sessions after email change.");
        }

        // Existing verification tokens were revoked atomically with the email update.
        const rawVerificationToken = generateSecureToken();
        const verificationTokenHash = hashToken(rawVerificationToken);
        const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await db.createAuthToken({
          userId: req.user.id,
          tokenHash: verificationTokenHash,
          type: "email_verification",
          expiresAt: verificationExpiresAt,
        });

        let verificationEmailSent = false;
        try {
          const delivery = await emailService.sendVerificationEmail(
            updates.email,
            rawVerificationToken,
            updatedUser.fullName,
          );
          verificationEmailSent = delivery.success;
          if (!verificationEmailSent) {
            console.error("[UsersRouter] Verification email delivery failed.");
          }
        } catch {
          console.error("[UsersRouter] Verification email delivery failed.");
        }

        if (!verificationEmailSent) {
          res.status(503).json({
            detail: "Email aggiornata, ma non è stato possibile inviare il link di verifica. Richiedi un nuovo invio della verifica.",
          });
          return;
        }
      } catch {
        // The email has already been persisted and the old session invalidated.
        // Report this partial outcome explicitly instead of a generic profile-update error.
        console.error("[UsersRouter] Failed to prepare verification after email change.");
        res.status(503).json({
          detail: "Email aggiornata, ma non è stato possibile inviare il link di verifica. Richiedi un nuovo invio della verifica.",
        });
        return;
      }
    }

    res.status(200).json(toSafeUserSession(updatedUser));
  } catch (err: any) {
    if (err.code === "23505" || err.message?.includes("already in use") || err.message?.includes("already registered")) {
      res.status(409).json({ detail: "Questa email è già in uso da un altro utente." });
      return;
    }
    res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
  }
}));

// ==========================================
// TEAM MANAGEMENT ROUTES (Tenant-Scoped)
// ==========================================

/**
 * GET /api/v1/users/team
 * List all team members in the authenticated user's company
 */
usersRouter.get("/team", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  const members = await teamService.listTeamMembers(req.user.companyId);
  res.status(200).json(members);
}));

/**
 * GET /api/v1/users/team/:id
 * Get a specific team member
 */
usersRouter.get("/team/:id", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  const member = await teamService.getTeamMember(req.user.companyId, req.params.id);
  res.status(200).json(member);
}));

/**
 * POST /api/v1/users/team
 * Create a new team member and generate an invite token
 */
usersRouter.post("/team", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  if (req.body?.role === "owner" && req.user.role !== "owner" && req.user.role !== "superadmin") {
    res.status(403).json({ detail: "Solo il titolare può assegnare il ruolo di titolare." });
    return;
  }

  const { member, inviteToken } = await teamService.inviteTeamMember(
    req.user.companyId,
    req.company.name,
    req.user.id,
    req.body
  );
  res.status(201).json({ member, inviteToken });
}));

/**
 * PUT /api/v1/users/team/:id
 * Update a team member's profile and role
 */
usersRouter.put("/team/:id", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  if (req.body?.role === "owner" && req.user.role !== "owner" && req.user.role !== "superadmin") {
    res.status(403).json({ detail: "Solo il titolare può assegnare il ruolo di titolare." });
    return;
  }

  const member = await teamService.updateTeamMember(
    req.user.companyId,
    req.params.id,
    req.user.id,
    req.body
  );
  res.status(200).json(member);
}));

/**
 * POST /api/v1/users/team/:id/activate
 * Activate a team member
 */
usersRouter.post("/team/:id/activate", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  const member = await teamService.changeMemberStatus(
    req.user.companyId,
    req.params.id,
    req.user.id,
    true
  );
  res.status(200).json(member);
}));

/**
 * POST /api/v1/users/team/:id/deactivate
 * Deactivate a team member
 */
usersRouter.post("/team/:id/deactivate", authenticate, requireRole([...TEAM_ADMIN_ROLES]), asyncHandler(async (req: any, res: any) => {
  const member = await teamService.changeMemberStatus(
    req.user.companyId,
    req.params.id,
    req.user.id,
    false
  );
  res.status(200).json(member);
}));
