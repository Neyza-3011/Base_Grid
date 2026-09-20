import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { isValidCalendarDate, isValidTime, validateSignatureBase64 } from "../validation";

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

  // work_hours: required, finite, >= 0, <= 1000
  if (work_hours === undefined || work_hours === null) {
    res.status(400).json({ detail: "Ore di lavoro obbligatorie." });
    return;
  }
  const workHours = typeof work_hours === "number" ? work_hours : (typeof work_hours === "string" && work_hours.trim() !== "" ? Number(work_hours) : NaN);
  if (!Number.isFinite(workHours) || workHours < 0 || workHours > 1000) {
    res.status(400).json({ detail: "Ore di lavoro non valide (devono essere un numero compreso tra 0 e 1000)." });
    return;
  }

  // travel_hours: optional, finite, >= 0, <= 1000, defaults to 0
  let travelHours = 0;
  if (travel_hours !== undefined && travel_hours !== null) {
    const parsedTravel = typeof travel_hours === "number" ? travel_hours : (typeof travel_hours === "string" && travel_hours.trim() !== "" ? Number(travel_hours) : NaN);
    if (!Number.isFinite(parsedTravel) || parsedTravel < 0 || parsedTravel > 1000) {
      res.status(400).json({ detail: "Ore di viaggio non valide (devono essere un numero compreso tra 0 e 1000)." });
      return;
    }
    travelHours = parsedTravel;
  }

  // client_name: required non-empty string, max 255 chars
  if (typeof client_name !== "string" || client_name.trim().length === 0 || client_name.trim().length > 255) {
    res.status(400).json({ detail: "Nome cliente non valido o mancante (massimo 255 caratteri)." });
    return;
  }
  const clientName = client_name.trim();

  // client_address: optional string, max 500 chars
  let clientAddress = "";
  if (client_address !== undefined && client_address !== null) {
    if (typeof client_address !== "string" || client_address.length > 500) {
      res.status(400).json({ detail: "Indirizzo cliente non valido (massimo 500 caratteri)." });
      return;
    }
    clientAddress = client_address.trim();
  }

  // client_city: optional string, max 100 chars
  let clientCity = "";
  if (client_city !== undefined && client_city !== null) {
    if (typeof client_city !== "string" || client_city.length > 100) {
      res.status(400).json({ detail: "Città cliente non valida (massimo 100 caratteri)." });
      return;
    }
    clientCity = client_city.trim();
  }

  // date validation (real calendar date YYYY-MM-DD)
  if (!isValidCalendarDate(date)) {
    res.status(400).json({ detail: "Data non valida o inesistente nel calendario. Formato richiesto: YYYY-MM-DD." });
    return;
  }

  // time validation (real time HH:mm in 00:00-23:59)
  if (!isValidTime(time)) {
    res.status(400).json({ detail: "Ora non valida o inesistente. Formato richiesto: HH:mm (00:00 - 23:59)." });
    return;
  }
  
  // status validation:
  // "approved" represents a subsequent authorized action and CANNOT be set at creation by client.
  if (status === "approved") {
    res.status(400).json({ detail: "Lo stato 'approved' non è consentito alla creazione del rapportino." });
    return;
  }
  if (status !== undefined && status !== "draft" && status !== "submitted") {
    res.status(400).json({ detail: "Stato non valido. Valori consentiti alla creazione: draft, submitted." });
    return;
  }
  const finalStatus: "draft" | "submitted" = status === "draft" ? "draft" : "submitted";

  // notes: optional string, max 2000 chars
  let safeNotes = "";
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string" || notes.length > 2000) {
      res.status(400).json({ detail: "Note non valide (massimo 2000 caratteri)." });
      return;
    }
    safeNotes = notes;
  }
  
  // materials_used: if present, must be an array of { name, quantity } with strict validation
  const safeMaterials: { name: string; quantity: number }[] = [];
  if (materials_used !== undefined && materials_used !== null) {
    if (!Array.isArray(materials_used)) {
      res.status(400).json({ detail: "materials_used deve essere un array." });
      return;
    }
    for (const m of materials_used) {
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        res.status(400).json({ detail: "Elemento materiale non valido (deve essere un oggetto)." });
        return;
      }
      // Check for unexpected/sensitive fields
      const keys = Object.keys(m);
      if (keys.some((k) => k !== "name" && k !== "quantity")) {
        res.status(400).json({ detail: "Campi non supportati nell'oggetto materiale (sono ammessi solo 'name' e 'quantity')." });
        return;
      }
      if (typeof m.name !== "string" || m.name.trim().length === 0 || m.name.trim().length > 255) {
        res.status(400).json({ detail: "Nome materiale non valido o vuoto (massimo 255 caratteri)." });
        return;
      }
      if (typeof m.quantity !== "number" || !Number.isFinite(m.quantity) || m.quantity < 0) {
        res.status(400).json({ detail: "Quantità materiale non valida (deve essere un numero finito >= 0)." });
        return;
      }
      safeMaterials.push({
        name: m.name.trim(),
        quantity: m.quantity,
      });
    }
  }

  // signature_base64: optional string, max 500KB, valid Data URL image format required
  let safeSignature: string | undefined = undefined;
  if (signature_base64 !== undefined && signature_base64 !== null) {
    const sigValidation = validateSignatureBase64(signature_base64);
    if (!sigValidation.valid) {
      res.status(sigValidation.status).json({ detail: sigValidation.error });
      return;
    }
    safeSignature = signature_base64;
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
