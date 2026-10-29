import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { NotFoundError } from "../errors";

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
