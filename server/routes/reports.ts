import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

function isValidId(id: any): boolean {
  return typeof id === "string" && id.trim().length > 0 && id.trim().length <= 100;
}

/**
 * GET /api/v1/reports
 * Returns reports strictly belonging to the authenticated user's company (tenant isolation).
 */
reportsRouter.get("/", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  let limitValue = Number(req.query.limit);
  if (!Number.isFinite(limitValue) || limitValue < 1) limitValue = 100;
  const limit = Math.min(limitValue, 1000);

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
reportsRouter.post("/", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  
  const {
    client_name,
    client_address,
    client_city,
    work_hours,
    travel_hours,
    date,
    time,
    notes,
    materials_used,
    status,
    signature_base64,
  } = req.body;

  const workHours = Number(work_hours);
  if (!Number.isFinite(workHours) || workHours < 0 || workHours > 1000) {
     res.status(400).json({ detail: "Ore di lavoro non valide." }); return;
  }
  const travelHours = Number(travel_hours);
  if (!Number.isFinite(travelHours) || travelHours < 0 || travelHours > 1000) {
     res.status(400).json({ detail: "Ore di viaggio non valide." }); return;
  }
  if (!client_name || typeof client_name !== "string" || client_name.trim().length < 1 || client_name.trim().length > 255) {
      res.status(400).json({ detail: "Nome cliente non valido." }); return;
  }
  const clientName = client_name.trim();
  const clientAddress = typeof client_address === "string" ? client_address.trim().substring(0, 500) : "";
  const clientCity = typeof client_city === "string" ? client_city.trim().substring(0, 100) : "";

  // date validation (YYYY-MM-DD)
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
     res.status(400).json({ detail: "Data non valida. Formato richiesto: YYYY-MM-DD." }); return;
  }
  // time validation (HH:mm)
  if (!time || typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
     res.status(400).json({ detail: "Ora non valida. Formato richiesto: HH:mm." }); return;
  }
  
  // status validation
  const allowedStatuses = ["draft", "submitted", "approved"];
  if (status !== undefined && !allowedStatuses.includes(status)) {
     res.status(400).json({ detail: "Status non valido." }); return;
  }
  const finalStatus = allowedStatuses.includes(status) ? status : "submitted";

  // notes
  const safeNotes = typeof notes === "string" ? notes.substring(0, 2000) : "";
  
  // materials
  let safeMaterials: { name: string; quantity: number }[] = [];
  if (Array.isArray(materials_used)) {
      safeMaterials = materials_used
          .filter(m => m && typeof m.name === "string" && (typeof m.quantity === "number" || typeof m.quantity === "string"))
          .map(m => {
              const q = Number(m.quantity);
              return {
                  name: m.name.substring(0, 255),
                  quantity: Number.isFinite(q) && q >= 0 ? q : 0
              };
          });
  }

  // base64
  let safeSignature = signature_base64;
  if (safeSignature !== undefined) {
      if (typeof safeSignature !== "string" || safeSignature.length > 500000) { // Limit to 500KB
          res.status(413).json({ detail: "Firma troppo grande o non valida." }); return;
      }
      if (!safeSignature.startsWith("data:image/")) {
          // just optional validation, base64 strings usually start with data:image/png;base64,...
          safeSignature = "";
      }
  }

  const newReport = await db.createReport(req.user.companyId, {
    date,
    time,
    workHours,
    travelHours,
    status: finalStatus as any,
    client: {
      name: clientName,
      address: clientAddress,
      city: clientCity,
    },
    technician: {
      fullName: req.user.fullName || "Tecnico",
    },
    materialsUsed: safeMaterials,
    notes: safeNotes,
    signatureBase64: safeSignature,
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
reportsRouter.delete("/:id", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  const reportId = req.params.id;
  if (!isValidId(reportId)) {
    res.status(400).json({ detail: "ID non valido." }); return;
  }

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
reportsRouter.get("/:id/pdf", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  const reportId = req.params.id;
  if (!isValidId(reportId)) {
    res.status(400).json({ detail: "ID non valido." }); return;
  }

  const report = await db.getReportById(req.user.companyId, reportId);
  if (!report) {
    res.status(404).json({ detail: "Rapportino non trovato o non accessibile." });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from("%PDF-1.4 Mock BaseGrid PDF Document per Rapportino " + reportId));
});
