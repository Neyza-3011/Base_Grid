import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

/**
 * GET /api/v1/reports
 * Returns reports strictly belonging to the authenticated user's company (tenant isolation).
 */
reportsRouter.get("/", async (req: any, res: any): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const reports = await db.getReportsByCompany(req.user.companyId, limit);

  // Map to API response schema expected by frontend
  const responseData = reports.map((r) => ({
    id: r.id,
    date: r.date,
    time: r.time,
    work_hours: r.workHours,
    travel_hours: r.travelHours,
    status: r.status,
    client: {
      name: r.client.name,
      address: r.client.address,
      city: r.client.city,
    },
    technician: {
      full_name: r.technician.fullName,
    },
    materials_used: r.materialsUsed,
    notes: r.notes,
    created_at: r.createdAt,
  }));

  res.status(200).json(responseData);
});

/**
 * POST /api/v1/reports
 * Creates a report linked strictly to the user's company (tenant isolation).
 */
reportsRouter.post("/", async (req: any, res: any): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  const {
    client_name,
    client_address,
    work_hours,
    travel_hours,
    date,
    time,
    notes,
    materials_used,
    status,
    signature_base64,
  } = req.body;

  const newReport = await db.createReport(req.user.companyId, {
    date,
    time,
    workHours: Number(work_hours) || 0,
    travelHours: Number(travel_hours) || 0,
    status: status || "submitted",
    client: {
      name: client_name || "Cliente Senza Nome",
      address: client_address || "",
    },
    technician: {
      fullName: req.user.fullName || "Tecnico",
    },
    materialsUsed: Array.isArray(materials_used) ? materials_used : [],
    notes: notes || "",
    signatureBase64: signature_base64,
  });

  res.status(201).json({
    id: newReport.id,
    date: newReport.date,
    time: newReport.time,
    work_hours: newReport.workHours,
    travel_hours: newReport.travelHours,
    status: newReport.status,
    client: newReport.client,
    technician: { full_name: newReport.technician.fullName },
    materials_used: newReport.materialsUsed,
    notes: newReport.notes,
    created_at: newReport.createdAt,
  });
});

/**
 * DELETE /api/v1/reports/:id
 * Deletes a report strictly if it belongs to the user's company.
 */
reportsRouter.delete("/:id", async (req: any, res: any): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  const reportId = req.params.id;
  const deleted = await db.deleteReport(req.user.companyId, reportId);

  if (!deleted) {
    res.status(404).json({ detail: "Rapportino non trovato o non appartenente alla tua azienda." });
    return;
  }

  res.status(200).json({ message: "Rapportino eliminato con successo." });
});

/**
 * GET /api/v1/reports/:id/pdf
 * Generates/returns PDF preview info
 */
reportsRouter.get("/:id/pdf", async (req: any, res: any): void => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from("%PDF-1.4 Mock BaseGrid PDF Document"));
});
