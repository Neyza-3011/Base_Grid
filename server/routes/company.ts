import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { db } from "../db";

export const companyRouter = Router();

/**
 * GET /api/v1/company/settings
 * Multi-tenant company settings read
 */
companyRouter.get("/settings", authenticate, async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  const company = await db.findCompanyById(req.user.companyId);
  if (!company) {
    res.status(404).json({ detail: "Azienda non trovata." });
    return;
  }

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
  });
});

/**
 * PUT /api/v1/company/settings
 * Multi-tenant company settings update (restricted to admin & superadmin)
 */
companyRouter.put(
  "/settings",
  authenticate,
  requireRole(["admin", "superadmin"]),
  async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ detail: "Non autenticato." });
      return;
    }

    const {
      name,
      vat_number,
      address,
      default_hourly_rate,
      report_footer_notes,
      stripe_subscription_status,
    } = req.body;

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
        res.status(400).json({ detail: "Nome azienda non valido." });
        return;
      }
      updates.name = name.trim();
    }

    if (vat_number !== undefined) {
      if (typeof vat_number !== "string" || vat_number.trim().length > 50) {
        res.status(400).json({ detail: "Partita IVA non valida." });
        return;
      }
      updates.vatNumber = vat_number.trim();
    }

    if (address !== undefined) {
      if (typeof address !== "string" || address.trim().length > 255) {
        res.status(400).json({ detail: "Indirizzo non valido." });
        return;
      }
      updates.address = address.trim();
    }

    if (default_hourly_rate !== undefined) {
      const rate = Number(default_hourly_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
        res.status(400).json({ detail: "Tariffa oraria non valida." });
        return;
      }
      updates.defaultHourlyRate = rate;
    }

    if (report_footer_notes !== undefined) {
      if (typeof report_footer_notes !== "string" || report_footer_notes.trim().length > 1000) {
         res.status(400).json({ detail: "Note a piè di pagina troppo lunghe." });
         return;
      }
      updates.reportFooterNotes = report_footer_notes.trim();
    }

    if (stripe_subscription_status !== undefined && req.user.role === "superadmin") {
      if (typeof stripe_subscription_status !== "string" || stripe_subscription_status.trim().length > 50) {
         res.status(400).json({ detail: "Stato abbonamento non valido." });
         return;
      }
      updates.stripeSubscriptionStatus = stripe_subscription_status.trim();
    }

    const updated = await db.updateCompany(req.user.companyId, updates);

    if (!updated) {
      res.status(500).json({ detail: "Impossibile aggiornare i dati aziendali." });
      return;
    }

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      vat_number: updated.vatNumber,
      address: updated.address,
      default_hourly_rate: updated.defaultHourlyRate,
      report_footer_notes: updated.reportFooterNotes,
      stripe_subscription_status: updated.stripeSubscriptionStatus,
    });
  },
);
