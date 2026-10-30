import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { NotFoundError, ValidationError } from "../errors";
import { companyService } from "../services";

export const adminRouter = Router();

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

  const updated = await companyService.updateCompanySettings(companyId, input as any, "superadmin");
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
 * PUT /api/v1/admin/tenants/:companyId/platform-settings
 * CEO-only operational controls; Stripe/billing state is intentionally not editable here.
 */
adminRouter.put("/tenants/:companyId/platform-settings", asyncHandler(async (req: any, res: any): Promise<void> => {
  const companyId = typeof req.params.companyId === "string" ? req.params.companyId.trim() : "";
  if (!companyId) throw new ValidationError("ID azienda non valido.");
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ValidationError("I dati inviati non sono validi.");
  }
  const allowed = new Set(["max_users", "feature_pdf_export"]);
  const keys = Object.keys(req.body);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    throw new ValidationError("Campi non supportati o nessun controllo da aggiornare.");
  }
  const input: Record<string, unknown> = {};
  if (req.body.max_users !== undefined) {
    if (typeof req.body.max_users !== "number" || !Number.isInteger(req.body.max_users) || req.body.max_users < 1 || req.body.max_users > 5000) {
      throw new ValidationError("Il limite utenti deve essere un intero tra 1 e 5000.");
    }
    input.maxUsers = req.body.max_users;
  }
  if (req.body.feature_pdf_export !== undefined) {
    if (typeof req.body.feature_pdf_export !== "boolean") {
      throw new ValidationError("feature_pdf_export deve essere un booleano.");
    }
    input.featurePdfExport = req.body.feature_pdf_export;
  }
  const updated = await companyService.updateCompanySettings(companyId, input as any, "superadmin");
  res.status(200).json({
    company: {
      id: updated.id,
      name: updated.name,
      max_users: updated.maxUsers,
      feature_pdf_export: updated.featurePdfExport,
      updated_at: updated.updatedAt,
    },
  });
}));

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
