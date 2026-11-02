import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { companyService } from "../services";
import { TeamService } from "../services/team.service";
import { tokenStore } from "../token-store";
import { ADMIN_OWNER_ROLES, ASSIGNABLE_ROLES } from "../types";

export const adminRouter = Router();
const teamService = new TeamService(db);

// Every platform administration endpoint requires trusted CEO platform authority.
adminRouter.use(authenticate);
adminRouter.use(requireSuperAdmin);

/**
 * GET /api/v1/admin/stats
 * Global platform statistics for the canonical platform CEO.
 */
adminRouter.get("/stats", asyncHandler(async (_req: any, res: any): Promise<void> => {
  const stats = await db.getGlobalStats();
  res.status(200).json(stats);
}));


/**
 * GET /api/v1/admin/audit-events
 * Returns a bounded list of persisted platform administration events.
 */
adminRouter.get("/audit-events", asyncHandler(async (req: any, res: any): Promise<void> => {
  const rawLimit = req.query?.limit;
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new ValidationError("Il limite degli eventi deve essere un intero tra 1 e 200.");
  }
  const events = await db.getAdminAuditEvents(limit);
  res.status(200).json({
    events: events.map((event) => ({
      id: event.id,
      actor_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId,
      metadata: event.metadata,
      created_at: event.createdAt,
    })),
  });
}));

/**
 * GET /api/v1/admin/tenants
 * Platform-wide company summaries. Only persisted values are returned;
 * lifecycle status is not inferred from billing metadata.
 */
adminRouter.get("/tenants", asyncHandler(async (_req: any, res: any): Promise<void> => {
  const tenantsList = await db.getAllTenants();
  const tenants = tenantsList.map((company) => ({
    id: company.id,
    name: company.name,
    plan: company.stripeSubscriptionStatus || null,
    created_at: company.createdAt,
    max_users: company.maxUsers,
    is_active: company.isActive ?? true,
    setup_complete: Boolean(company.name?.trim() && company.address?.trim()),
  }));
  res.status(200).json(tenants);
}));


/**
 * PUT /api/v1/admin/tenants/:companyId/profile
 * Update only editable company profile fields. Platform/billing controls are intentionally excluded.
 */
adminRouter.put("/tenants/:companyId/profile", asyncHandler(async (req: any, res: any): Promise<void> => {
  const companyId = typeof req.params.companyId === "string" ? req.params.companyId.trim() : "";
  if (!companyId) {
    res.status(400).json({ detail: "ID azienda non valido." });
    return;
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ValidationError("I dati inviati non sono validi.");
  }

  const allowedFields = new Set([
    "name",
    "vat_number",
    "address",
    "default_hourly_rate",
    "report_footer_notes",
  ]);
  const keys = Object.keys(req.body);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
    throw new ValidationError("Sono presenti campi non modificabili o nessun campo da aggiornare.");
  }

  const input: Record<string, unknown> = {};
  const stringFields: Array<[string, string]> = [
    ["name", "name"],
    ["vat_number", "vatNumber"],
    ["address", "address"],
    ["report_footer_notes", "reportFooterNotes"],
  ];
  for (const [externalKey, internalKey] of stringFields) {
    if (req.body[externalKey] !== undefined) {
      if (typeof req.body[externalKey] !== "string") {
        throw new ValidationError(`Il campo ${externalKey} deve essere una stringa.`);
      }
      input[internalKey] = req.body[externalKey];
    }
  }
  if (req.body.default_hourly_rate !== undefined) {
    if (typeof req.body.default_hourly_rate !== "number" || !Number.isFinite(req.body.default_hourly_rate)) {
      throw new ValidationError("Il campo default_hourly_rate deve essere un numero valido.");
    }
    input.defaultHourlyRate = req.body.default_hourly_rate;
  }

  const updated = await companyService.updateCompanySettings(companyId, input as any, "superadmin", {
    actorUserId: req.user.id,
    action: "tenant.profile.updated",
    targetType: "company",
    targetId: companyId,
  });
  res.status(200).json({
    company: {
      id: updated.id,
      name: updated.name,
      vat_number: updated.vatNumber,
      address: updated.address,
      default_hourly_rate: updated.defaultHourlyRate,
      report_footer_notes: updated.reportFooterNotes,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    },
  });
}));


/**
 * PUT /api/v1/admin/tenants/:companyId/users/:userId
 * CEO-only profile/tenant-role update. Platform authority is never editable here.
 */
adminRouter.put("/tenants/:companyId/users/:userId", asyncHandler(async (req: any, res: any): Promise<void> => {
  const { companyId, userId } = req.params;
  if (typeof companyId !== "string" || !companyId.trim() || typeof userId !== "string" || !userId.trim()) {
    throw new ValidationError("Identificativi azienda/utente non validi.");
  }
  const target = await db.getUserByIdAndCompany(userId, companyId);
  if (!target) throw new NotFoundError("Utente non trovato in questa azienda.");
  if (target.platformRole === "ceo" || target.role === "superadmin") {
    throw new ForbiddenError("L'account CEO/piattaforma non è modificabile da questa operazione.");
  }
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ValidationError("I dati inviati non sono validi.");
  }
  const allowed = new Set(["full_name", "phone_number", "role"]);
  const keys = Object.keys(req.body);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    throw new ValidationError("Campi non supportati o nessun campo da aggiornare.");
  }
  const input: Record<string, unknown> = {};
  if (req.body.full_name !== undefined) {
    if (typeof req.body.full_name !== "string") throw new ValidationError("Il nome deve essere una stringa.");
    input.fullName = req.body.full_name;
  }
  if (req.body.phone_number !== undefined) {
    if (typeof req.body.phone_number !== "string") throw new ValidationError("Il telefono deve essere una stringa.");
    input.phoneNumber = req.body.phone_number;
  }
  if (req.body.role !== undefined) {
    if (typeof req.body.role !== "string") throw new ValidationError("Il ruolo deve essere una stringa.");
    input.role = req.body.role;
  }
  if (input.role !== undefined && input.role !== target.role) {
    if (!ASSIGNABLE_ROLES.includes(input.role as any)) {
      throw new ForbiddenError("Ruolo non valido o non assegnabile.");
    }
    if (userId === req.user.id) {
      throw new ForbiddenError("Non puoi modificare il tuo stesso ruolo.");
    }
    if (ADMIN_OWNER_ROLES.includes(target.role) && !ADMIN_OWNER_ROLES.includes(input.role as any)) {
      const adminCount = await db.countAdminOwnersByCompany(companyId, userId);
      if (adminCount === 0) {
        throw new ForbiddenError("Impossibile rimuovere l'ultimo amministratore attivo dell'azienda.");
      }
    }
    if (!tokenStore.isAvailable()) {
      res.status(503).json({ detail: "Servizio sessioni non disponibile: modifica del ruolo annullata." });
      return;
    }
    try {
      await tokenStore.revokeAllUserTokens(userId);
    } catch {
      res.status(503).json({ detail: "Impossibile revocare le sessioni: modifica del ruolo annullata." });
      return;
    }
  }
  const changedFields = Object.entries(input)
    .filter(([key, value]) => {
      const currentValue = key === "fullName" ? target.fullName
        : key === "phoneNumber" ? target.phoneNumber
        : key === "role" ? target.role
        : undefined;
      return value !== currentValue;
    })
    .map(([key]) => key)
    .sort();
  const audit = changedFields.length > 0 ? {
    actorUserId: req.user.id,
    action: "user.profile.updated",
    targetType: "user" as const,
    targetId: userId,
    metadata: { companyId, changedFields: changedFields.join(",") },
  } : undefined;
  const member = await teamService.updateTeamMember(companyId, userId, req.user.id, input as any, audit);
  res.status(200).json({
    user: {
      id: member.id,
      email: member.email,
      full_name: member.fullName,
      role: member.role,
      phone_number: member.phoneNumber,
      is_active: member.isActive,
      email_confirmed: member.emailConfirmed,
      created_at: member.createdAt,
    },
  });
}));

/**
 * POST /api/v1/admin/tenants/:companyId/users/:userId/activate|deactivate
 * Deactivation revokes refresh sessions before changing persisted access state.
 */
for (const isActive of [true, false]) {
  const action = isActive ? "activate" : "deactivate";
  adminRouter.post(`/tenants/:companyId/users/:userId/${action}`, asyncHandler(async (req: any, res: any): Promise<void> => {
    const { companyId, userId } = req.params;
    if (typeof companyId !== "string" || !companyId.trim() || typeof userId !== "string" || !userId.trim()) {
      throw new ValidationError("Identificativi azienda/utente non validi.");
    }
    const target = await db.getUserByIdAndCompany(userId, companyId);
    if (!target) throw new NotFoundError("Utente non trovato in questa azienda.");
    if (target.platformRole === "ceo" || target.role === "superadmin") {
      throw new ForbiddenError("L'account CEO/piattaforma non può essere disattivato da questa operazione.");
    }
    if (!isActive && !target.isActive) {
      const member = await teamService.changeMemberStatus(companyId, userId, req.user.id, false);
      res.status(200).json({ user: {
        id: member.id, email: member.email, full_name: member.fullName, role: member.role,
        phone_number: member.phoneNumber, is_active: member.isActive,
        email_confirmed: member.emailConfirmed, created_at: member.createdAt,
      } });
      return;
    }
    if (!isActive) {
      if (target.isActive && ADMIN_OWNER_ROLES.includes(target.role)) {
        const adminCount = await db.countAdminOwnersByCompany(companyId, userId);
        if (adminCount === 0) {
          throw new ForbiddenError("Impossibile disattivare l'ultimo amministratore attivo dell'azienda.");
        }
      }
      if (!tokenStore.isAvailable()) {
        res.status(503).json({ detail: "Servizio sessioni non disponibile: disattivazione annullata." });
        return;
      }
      try {
        await tokenStore.revokeAllUserTokens(userId);
      } catch {
        res.status(503).json({ detail: "Impossibile revocare le sessioni: disattivazione annullata." });
        return;
      }
    }
    const member = await teamService.changeMemberStatus(companyId, userId, req.user.id, isActive, {
      actorUserId: req.user.id,
      action: isActive ? "user.activated" : "user.deactivated",
      targetType: "user",
      targetId: userId,
      metadata: { companyId, isActive },
    });
    res.status(200).json({ user: {
      id: member.id, email: member.email, full_name: member.fullName, role: member.role,
      phone_number: member.phoneNumber, is_active: member.isActive,
      email_confirmed: member.emailConfirmed, created_at: member.createdAt,
    } });
  }));
}


/**
 * POST /api/v1/admin/tenants/:companyId/suspend|reactivate
 * Company suspension is reversible, invalidates all tenant auth versions and records an audit event atomically.
 */
for (const isActive of [false, true]) {
  const action = isActive ? "reactivate" : "suspend";
  adminRouter.post(`/tenants/:companyId/${action}`, asyncHandler(async (req: any, res: any): Promise<void> => {
    const companyId = typeof req.params.companyId === "string" ? req.params.companyId.trim() : "";
    if (!companyId) throw new ValidationError("ID azienda non valido.");

    const company = await db.findCompanyById(companyId);
    if (!company) throw new NotFoundError("Azienda non trovata.");
    if (companyId === req.user.companyId || companyId === "comp-master-001") {
      throw new ForbiddenError("Non puoi sospendere o riattivare l'azienda della piattaforma.");
    }
    const companyUsers = await db.getUsersByCompany(companyId);
    if (companyUsers.some((member) => member.platformRole === "ceo")) {
      throw new ForbiddenError("Un'azienda associata all'identità CEO non può essere sospesa da questa operazione.");
    }

    if ((company.isActive ?? true) === isActive) {
      res.status(200).json({
        company: { id: company.id, name: company.name, is_active: company.isActive ?? true },
        changed: false,
      });
      return;
    }

    const updated = await db.setCompanyActiveWithAudit(companyId, isActive, {
      actorUserId: req.user.id,
      action: isActive ? "tenant.reactivated" : "tenant.suspended",
      targetType: "company",
      targetId: companyId,
      metadata: { isActive },
    });
    if (!updated) throw new NotFoundError("Azienda non trovata.");
    res.status(200).json({
      company: {
        id: updated.id,
        name: updated.name,
        is_active: updated.isActive ?? true,
        updated_at: updated.updatedAt,
      },
      changed: true,
    });
  }));
}

/**
 * GET /api/v1/admin/tenants/:companyId
 * Detailed persisted company profile and safe team-member summaries.
 * Secrets, password hashes, salts, auth versions and token material are never exposed.
 */
adminRouter.get("/tenants/:companyId", asyncHandler(async (req: any, res: any): Promise<void> => {
  const companyId = typeof req.params.companyId === "string" ? req.params.companyId.trim() : "";
  if (!companyId) {
    res.status(400).json({ detail: "ID azienda non valido." });
    return;
  }

  const company = await db.findCompanyById(companyId);
  if (!company) {
    throw new NotFoundError("Azienda non trovata.");
  }

  const users = await db.getUsersByCompany(companyId);
  const safeUsers = users.map((member) => ({
    id: member.id,
    email: member.email,
    full_name: member.fullName,
    role: member.role,
    is_active: member.isActive,
    email_confirmed: member.emailConfirmed,
    phone_number: member.phoneNumber || null,
    created_at: member.createdAt,
    updated_at: member.updatedAt,
  }));

  res.status(200).json({
    company: {
      id: company.id,
      name: company.name,
      vat_number: company.vatNumber,
      address: company.address,
      default_hourly_rate: company.defaultHourlyRate,
      report_footer_notes: company.reportFooterNotes,
      subscription_status: company.stripeSubscriptionStatus || null,
      max_users: company.maxUsers,
      feature_pdf_export: company.featurePdfExport,
      is_active: company.isActive ?? true,
      created_at: company.createdAt,
      updated_at: company.updatedAt,
      setup_complete: Boolean(company.name?.trim() && company.address?.trim()),
    },
    users: safeUsers,
    user_count: safeUsers.length,
    active_user_count: safeUsers.filter((member) => member.is_active).length,
    owner: safeUsers.find((member) => member.role === "owner") || null,
  });
}));
