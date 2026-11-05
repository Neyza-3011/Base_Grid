import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { companyService } from "../services";
import { asyncHandler } from "../async-handler";
import { UnauthorizedError } from "../errors";

export const companyRouter = Router();

/**
 * GET /api/v1/company/settings
 * Multi-tenant company settings read
 */
companyRouter.get(
  "/settings",
  authenticate,
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }

    const rawIncludeLogo = req.query.include_logo;
    if (rawIncludeLogo !== undefined && typeof rawIncludeLogo !== "string") {
      res.status(400).json({ detail: "Il parametro include_logo deve essere un valore singolo." });
      return;
    }
    if (rawIncludeLogo !== undefined && rawIncludeLogo !== "true" && rawIncludeLogo !== "false") {
      res.status(400).json({ detail: "Il parametro include_logo deve essere true o false." });
      return;
    }
    const includeLogo = rawIncludeLogo !== "false";
    const company = await companyService.getCompanySettings(req.user.companyId, includeLogo);

    res.status(200).json({
      id: company.id,
      name: company.name,
      vat_number: company.vatNumber,
      address: company.address,
      default_hourly_rate: company.defaultHourlyRate,
      report_footer_notes: company.reportFooterNotes,
      stripe_subscription_status: company.stripeSubscriptionStatus,
      max_users: company.maxUsers,
      feature_pdf_export: company.featurePdfExport,
      logo_data_url: company.logoDataUrl || null,
    });
  })
);

/**
 * PUT /api/v1/company/settings
 * Multi-tenant company settings update (restricted to admin & superadmin)
 */
companyRouter.put(
  "/settings",
  authenticate,
  requireRole(["owner", "admin", "superadmin"]),
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({ detail: "I dati inviati non sono validi." });
      return;
    }

    const {
      name,
      vat_number,
      address,
      default_hourly_rate,
      report_footer_notes,
      logo_data_url,
      stripe_subscription_status,
    } = req.body;

    const input: any = {};
    if (name !== undefined) input.name = name;
    if (vat_number !== undefined) input.vatNumber = vat_number;
    if (address !== undefined) input.address = address;
    if (default_hourly_rate !== undefined) input.defaultHourlyRate = default_hourly_rate;
    if (report_footer_notes !== undefined) input.reportFooterNotes = report_footer_notes;
    if (logo_data_url !== undefined) input.logoDataUrl = logo_data_url;
    if (stripe_subscription_status !== undefined && req.user.role === "superadmin") {
      input.stripeSubscriptionStatus = stripe_subscription_status;
    }

    const updated = await companyService.updateCompanySettings(
      req.user.companyId,
      input,
      req.user.role
    );

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      vat_number: updated.vatNumber,
      address: updated.address,
      default_hourly_rate: updated.defaultHourlyRate,
      report_footer_notes: updated.reportFooterNotes,
      logo_data_url: updated.logoDataUrl || null,
      stripe_subscription_status: updated.stripeSubscriptionStatus,
    });
  })
);
