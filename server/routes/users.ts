import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { hashPassword, isValidEmail, normalizeEmail, toSafeUserSession, verifyPassword, validatePasswordPolicy } from "../security";
import { tokenStore } from "../token-store";

export const usersRouter = Router();

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
usersRouter.put("/me", authenticate, async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  const { full_name, email, password, current_password, phone_number } = req.body;
  const updates: any = {};

  if (full_name && typeof full_name === "string") {
    updates.fullName = full_name.trim();
  }

  if (email && typeof email === "string") {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      res.status(400).json({ detail: "Formato email non valido." });
      return;
    }
    // If email is changing, ensure uniqueness
    if (normalized !== req.user.email) {
      const existing = await db.findUserByEmail(normalized);
      if (existing) {
        res.status(409).json({ detail: "Questa email è già in uso da un altro utente." });
        return;
      }
      updates.email = normalized;
    }
  }

  if (password && typeof password === "string") {
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
    updates.phoneNumber = phone_number;
  }

  try {
    const updatedUser = await db.updateUser(req.user.id, updates);
    if (!updatedUser) {
      res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
      return;
    }

    if (password && typeof password === "string") {
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/api/v1/auth" });
      res.clearCookie("csrf_token", { path: "/" });
    }

    res.status(200).json(toSafeUserSession(updatedUser));
  } catch (err: any) {
    if (err.code === "23505" || err.message?.includes("already in use") || err.message?.includes("already registered")) {
      res.status(409).json({ detail: "Questa email è già in uso da un altro utente." });
      return;
    }
    res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
  }
});

