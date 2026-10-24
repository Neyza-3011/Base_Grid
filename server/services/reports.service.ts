import { IDatabaseAdapter } from "../db";
import { ReportRecord, CreateReportRequest, ReportResponseDTO, ReportMaterialsStatus, UserRole } from "../types";
import { AppError, NotFoundError, ValidationError, ForbiddenError, BadRequestError } from "../errors";
import { isValidCalendarDate, isValidTime, validateSignatureBase64 } from "../validation";

export type { ReportResponseDTO };

export class ReportsService {
  constructor(private readonly db: IDatabaseAdapter) {}

  /**
   * List all reports for an authenticated company with optional limit.
   */
  async listReports(companyId: string, rawLimit?: any): Promise<ReportResponseDTO[]> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
    }

    let limitValue = Number(rawLimit);
    if (!Number.isFinite(limitValue) || limitValue < 1) limitValue = 100;
    const limit = Math.min(limitValue, 1000);

    const reports = await this.db.getReportsByCompany(companyId, limit);
    return reports.map(this.toResponseDTO);
  }

  /**
   * Get single report by ID ensuring tenant isolation.
   */
  async getReportById(companyId: string, reportId: string): Promise<ReportRecord> {
    if (!companyId || !reportId) {
      throw new ValidationError("Report ID and Company ID are required");
    }

    const report = await this.db.getReportById(companyId, reportId);
    if (!report) {
      throw new NotFoundError("Rapportino non trovato o non accessibile.");
    }

    // Resolve the linked site inside the authenticated tenant before PDF generation.
    // Legacy reports without a location remain readable and omit the site name.
    if (report.locationId) {
      const location = await this.db.getLocationByIdAndCompany(report.locationId, companyId);
      if (location) {
        return { ...report, locationName: location.name };
      }
    }
    return report;
  }

  /**
   * Create a new report with business validations and tenant assignment.
   */
  async createReport(
    companyId: string,
    creatorName: string,
    body: CreateReportRequest,
    actor?: { id: string; role: UserRole },
  ): Promise<ReportResponseDTO> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
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
      materials_status,
      materials_used,
      status,
      signature_base64,
      customer_id,
      location_id,
      intervention_id,
    } = body || {};

    // Technicians may submit field reports only for an intervention assigned to themselves.
    // Standalone reports remain available to the existing operational roles, not technicians.
    const hasInterventionId = typeof intervention_id === "string" && intervention_id.trim().length > 0;
    if (actor?.role === "technician" && !hasInterventionId) {
      throw new ForbiddenError("Il tecnico può creare un rapportino solo per un intervento assegnato.");
    }

    // 1. Intervention validation (if specified)
    let validatedInterventionId: string | undefined = undefined;
    let interventionRecord: any = null;

    if (intervention_id !== undefined && intervention_id !== null && String(intervention_id).trim() !== "") {
      const rawInterventionId = typeof intervention_id === "string" ? intervention_id.trim() : String(intervention_id);
      interventionRecord = await this.db.getInterventionByIdAndCompany(rawInterventionId, companyId);
      if (!interventionRecord) {
        throw new NotFoundError("Intervento non trovato o non accessibile.");
      }
      if (actor?.role === "technician" && interventionRecord.technicianId !== actor.id) {
        throw new ForbiddenError("Il tecnico può creare un rapportino soltanto per un intervento assegnato a sé.");
      }
      validatedInterventionId = interventionRecord.id;
    }

    // 2. Customer & Location resolution and consistency checks
    let targetCustomerId: string | undefined = undefined;
    let targetLocationId: string | undefined = undefined;

    if (interventionRecord) {
      if (customer_id !== undefined && customer_id !== null && String(customer_id).trim() !== "") {
        const rawCid = typeof customer_id === "string" ? customer_id.trim() : String(customer_id);
        if (rawCid !== interventionRecord.customerId) {
          throw new ValidationError("Il cliente specificato non corrisponde a quello dell'intervento.");
        }
        targetCustomerId = rawCid;
      } else {
        targetCustomerId = interventionRecord.customerId;
      }

      if (location_id !== undefined && location_id !== null && String(location_id).trim() !== "") {
        const rawLid = typeof location_id === "string" ? location_id.trim() : String(location_id);
        if (rawLid !== interventionRecord.locationId) {
          throw new ValidationError("La sede specificata non corrisponde a quella dell'intervento.");
        }
        targetLocationId = rawLid;
      } else {
        targetLocationId = interventionRecord.locationId;
      }
    } else {
      if (customer_id !== undefined && customer_id !== null && String(customer_id).trim() !== "") {
        targetCustomerId = typeof customer_id === "string" ? customer_id.trim() : String(customer_id);
      }
      if (location_id !== undefined && location_id !== null && String(location_id).trim() !== "") {
        targetLocationId = typeof location_id === "string" ? location_id.trim() : String(location_id);
      }
    }

    let validatedCustomerId: string | undefined = undefined;
    let validatedLocationId: string | undefined = undefined;
    let customerRecord = null;
    let locationRecord = null;

    if (targetLocationId) {
      locationRecord = await this.db.getLocationByIdAndCompany(targetLocationId, companyId);
      if (!locationRecord) {
        throw new NotFoundError("Sede o cantiere non trovato o non accessibile.");
      }
      validatedLocationId = locationRecord.id;
      if (!targetCustomerId && locationRecord.customerId) {
        targetCustomerId = locationRecord.customerId;
      }
    }

    if (targetCustomerId) {
      customerRecord = await this.db.getCustomerByIdAndCompany(targetCustomerId, companyId);
      if (!customerRecord) {
        throw new NotFoundError("Cliente non trovato o non accessibile.");
      }
      validatedCustomerId = customerRecord.id;
    }

    if (customerRecord && locationRecord) {
      if (locationRecord.customerId !== customerRecord.id) {
        throw new ValidationError("La sede specificata non appartiene al cliente indicato.");
      }
    }

    // 3. Client details resolution
    let resolvedClientName = typeof client_name === "string" ? client_name.trim() : "";
    if (!resolvedClientName && interventionRecord && customerRecord) {
      resolvedClientName = customerRecord.displayName;
    }
    if (!resolvedClientName || resolvedClientName.length > 255) {
      throw new ValidationError(
        "Nome cliente non valido o mancante (massimo 255 caratteri)."
      );
    }
    const clientName = resolvedClientName;

    let clientAddress = "";
    if (client_address !== undefined && client_address !== null) {
      if (typeof client_address !== "string" || client_address.length > 500) {
        throw new ValidationError(
          "Indirizzo cliente non valido (massimo 500 caratteri)."
        );
      }
      clientAddress = client_address.trim();
    } else if (interventionRecord && locationRecord) {
      clientAddress = locationRecord.address || "";
    }

    let clientCity = "";
    if (client_city !== undefined && client_city !== null) {
      if (typeof client_city !== "string" || client_city.length > 100) {
        throw new ValidationError("Città cliente non valida (massimo 100 caratteri).");
      }
      clientCity = client_city.trim();
    } else if (interventionRecord && locationRecord) {
      clientCity = locationRecord.city || "";
    }

    // work_hours: required, finite, >= 0, <= 24 for a single field report
    if (work_hours === undefined || work_hours === null) {
      throw new ValidationError("Ore di lavoro obbligatorie.");
    }
    const workHours =
      typeof work_hours === "number"
        ? work_hours
        : typeof (work_hours as unknown) === "string" && (work_hours as unknown as string).trim() !== ""
        ? Number(work_hours)
        : NaN;
    if (!Number.isFinite(workHours) || workHours < 0 || workHours > 24) {
      throw new ValidationError(
        "Ore di lavoro non valide (devono essere un numero compreso tra 0 e 24)."
      );
    }

    // travel_hours: optional, finite, >= 0, <= 24, defaults to 0
    let travelHours = 0;
    if (travel_hours !== undefined && travel_hours !== null) {
      const parsedTravel =
        typeof travel_hours === "number"
          ? travel_hours
          : typeof (travel_hours as unknown) === "string" && (travel_hours as unknown as string).trim() !== ""
          ? Number(travel_hours)
          : NaN;
      if (!Number.isFinite(parsedTravel) || parsedTravel < 0 || parsedTravel > 24) {
        throw new ValidationError(
          "Ore di viaggio non valide (devono essere un numero compreso tra 0 e 24)."
        );
      }
      travelHours = parsedTravel;
    }

    // date validation (real calendar date YYYY-MM-DD)
    if (!isValidCalendarDate(date)) {
      throw new ValidationError(
        "Data non valida o inesistente nel calendario. Formato richiesto: YYYY-MM-DD."
      );
    }

    // time validation (real time HH:mm in 00:00-23:59)
    if (!isValidTime(time)) {
      throw new ValidationError(
        "Ora non valida o inesistente. Formato richiesto: HH:mm (00:00 - 23:59)."
      );
    }

    // status validation:
    if (status === "approved") {
      throw new ValidationError(
        "Lo stato 'approved' non è consentito alla creazione del rapportino."
      );
    }
    if (status !== undefined && status !== "draft" && status !== "submitted") {
      throw new ValidationError(
        "Stato non valido. Valori consentiti alla creazione: draft, submitted."
      );
    }
    const finalStatus: "draft" | "submitted" =
      status === "draft" ? "draft" : "submitted";

    // A submitted field report must record positive working time. Drafts may be
    // saved incomplete so the technician can resume data entry later.
    if (finalStatus === "submitted" && workHours <= 0) {
      throw new ValidationError("Per inviare il rapportino le ore di lavoro devono essere maggiori di zero.");
    }

    // notes: optional string, max 2000 chars
    let safeNotes = "";
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== "string" || notes.length > 2000) {
        throw new ValidationError("Note non valide (massimo 2000 caratteri).");
      }
      safeNotes = notes;
    }

    // materials_used: if present, must be an array of { name, quantity }
    const safeMaterials: { name: string; quantity: number }[] = [];
    if (materials_used !== undefined && materials_used !== null) {
      if (!Array.isArray(materials_used)) {
        throw new ValidationError("materials_used deve essere un array.");
      }
      for (const m of materials_used) {
        if (!m || typeof m !== "object" || Array.isArray(m)) {
          throw new ValidationError(
            "Elemento materiale non valido (deve essere un oggetto)."
          );
        }
        const keys = Object.keys(m);
        if (keys.some((k) => k !== "name" && k !== "quantity")) {
          throw new ValidationError(
            "Campi non supportati nell'oggetto materiale (sono ammessi solo 'name' e 'quantity')."
          );
        }
        if (
          typeof m.name !== "string" ||
          m.name.trim().length === 0 ||
          m.name.trim().length > 255
        ) {
          throw new ValidationError(
            "Nome materiale non valido o vuoto (massimo 255 caratteri)."
          );
        }
        if (
          typeof m.quantity !== "number" ||
          !Number.isFinite(m.quantity) ||
          !Number.isInteger(m.quantity) ||
          m.quantity < 1
        ) {
          throw new ValidationError(
            "Quantità materiale non valida (deve essere un numero intero >= 1)."
          );
        }
        safeMaterials.push({
          name: m.name.trim(),
          quantity: m.quantity,
        });
      }
    }

    // Explicit materials verification state resolution
    let resolvedMaterialsStatus: ReportMaterialsStatus = "unverified";
    if (materials_status !== undefined && materials_status !== null) {
      if (materials_status !== "used" && materials_status !== "none" && materials_status !== "unverified") {
        throw new ValidationError("Stato verifica materiali non valido. Valori ammessi: 'used', 'none', 'unverified'.");
      }
      if (materials_status === "none") {
        if (safeMaterials.length > 0) {
          throw new ValidationError("Non è possibile indicare materiali utilizzati se la verifica conferma 'nessun materiale utilizzato' ('none').");
        }
        resolvedMaterialsStatus = "none";
      } else if (materials_status === "used") {
        const hasPositiveQuantity = safeMaterials.some((m) => m.quantity > 0);
        if (safeMaterials.length === 0 || !hasPositiveQuantity) {
          throw new ValidationError("Se la verifica dichiara 'materiali utilizzati' ('used'), è necessario indicare almeno un materiale con quantità positiva (> 0).");
        }
        resolvedMaterialsStatus = "used";
      } else {
        resolvedMaterialsStatus = "unverified";
      }
    } else {
      // Backward compatibility: if items provided with positive quantity, infer 'used'; otherwise remain 'unverified'
      const hasPositiveQuantity = safeMaterials.some((m) => m.quantity > 0);
      if (safeMaterials.length > 0 && hasPositiveQuantity) {
        resolvedMaterialsStatus = "used";
      } else {
        resolvedMaterialsStatus = "unverified";
      }
    }

    // signature_base64: optional string, max 500KB
    let safeSignature: string | undefined = undefined;
    if (signature_base64 !== undefined && signature_base64 !== null) {
      const sigValidation = validateSignatureBase64(signature_base64);
      if (!sigValidation.valid) {
        throw new AppError(sigValidation.error, sigValidation.status || 400);
      }
      safeSignature = signature_base64;
    }

    const newReport = await this.db.createReport(companyId, {
      customerId: validatedCustomerId,
      locationId: validatedLocationId,
      interventionId: validatedInterventionId,
      date,
      time,
      workHours,
      travelHours,
      status: finalStatus,
      client: {
        name: clientName,
        address: clientAddress,
        city: clientCity,
      },
      technician: {
        fullName: creatorName || "Tecnico",
      },
      materialsStatus: resolvedMaterialsStatus,
      materialsUsed: safeMaterials,
      notes: safeNotes,
      signatureBase64: safeSignature,
    });

    return this.toResponseDTO(newReport);
  }

  /**
   * Update an existing draft without allowing tenant, technician, or relationship changes.
   * The database adapter performs the final status check atomically to prevent stale edits.
   */
  async updateDraftReport(
    companyId: string,
    reportId: string,
    body: CreateReportRequest,
    actor?: { id: string; role: UserRole },
  ): Promise<ReportResponseDTO> {
    if (!companyId || !reportId) {
      throw new ValidationError("Report ID and Company ID are required");
    }

    const allowedKeys = new Set([
      "client_name", "client_address", "client_city", "work_hours", "travel_hours",
      "date", "time", "notes", "materials_status", "materials_used", "status", "signature_base64",
    ]);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !allowedKeys.has(key))) {
      throw new ValidationError("Il payload contiene campi non consentiti per la modifica del rapportino.");
    }

    const existing = await this.db.getReportById(companyId, reportId);
    if (!existing) {
      throw new NotFoundError("Rapportino non trovato o non accessibile.");
    }
    if (existing.status !== "draft") {
      throw new BadRequestError("È possibile modificare soltanto un rapportino in bozza.");
    }

    if (actor?.role === "technician") {
      if (!existing.interventionId) {
        throw new ForbiddenError("Il tecnico può modificare soltanto bozze collegate a un intervento assegnato.");
      }
      const intervention = await this.db.getInterventionByIdAndCompany(existing.interventionId, companyId);
      if (!intervention || intervention.technicianId !== actor.id) {
        throw new ForbiddenError("Il tecnico può modificare soltanto bozze di interventi assegnati a sé.");
      }
    }

    const clientName = body.client_name === undefined
      ? existing.client.name
      : (typeof body.client_name === "string" ? body.client_name.trim() : "");
    if (!clientName || clientName.length > 255) {
      throw new ValidationError("Nome cliente non valido o mancante (massimo 255 caratteri).");
    }
    const clientAddress = body.client_address === undefined ? (existing.client.address ?? "") : body.client_address;
    if (typeof clientAddress !== "string" || clientAddress.length > 500) {
      throw new ValidationError("Indirizzo cliente non valido (massimo 500 caratteri).");
    }
    const clientCity = body.client_city === undefined ? (existing.client.city ?? "") : body.client_city;
    if (typeof clientCity !== "string" || clientCity.length > 100) {
      throw new ValidationError("Città cliente non valida (massimo 100 caratteri).");
    }

    const rawWorkHours = body.work_hours === undefined ? existing.workHours : body.work_hours;
    const workHours =
      typeof rawWorkHours === "number"
        ? rawWorkHours
        : typeof (rawWorkHours as unknown) === "string" && (rawWorkHours as unknown as string).trim() !== ""
        ? Number(rawWorkHours)
        : NaN;
    if (!Number.isFinite(workHours) || workHours < 0 || workHours > 24) {
      throw new ValidationError("Ore di lavoro non valide (devono essere un numero compreso tra 0 e 24).");
    }

    const rawTravelHours = body.travel_hours === undefined ? existing.travelHours : body.travel_hours;
    const travelHours =
      typeof rawTravelHours === "number"
        ? rawTravelHours
        : typeof (rawTravelHours as unknown) === "string" && (rawTravelHours as unknown as string).trim() !== ""
        ? Number(rawTravelHours)
        : NaN;
    if (!Number.isFinite(travelHours) || travelHours < 0 || travelHours > 24) {
      throw new ValidationError("Ore di viaggio non valide (devono essere un numero compreso tra 0 e 24).");
    }

    const targetDate = body.date === undefined ? existing.date : body.date;
    if (!isValidCalendarDate(targetDate)) {
      throw new ValidationError("Data non valida o inesistente nel calendario. Formato richiesto: YYYY-MM-DD.");
    }

    const targetTime = body.time === undefined ? existing.time : body.time;
    if (!isValidTime(targetTime)) {
      throw new ValidationError("Ora non valida o inesistente. Formato richiesto: HH:mm (00:00 - 23:59).");
    }

    const status = body.status === undefined ? "draft" : body.status;
    if (status !== "draft" && status !== "submitted") {
      throw new ValidationError("Stato non valido. Valori consentiti: draft, submitted.");
    }
    if (status === "submitted" && workHours <= 0) {
      throw new ValidationError("Per inviare il rapportino le ore di lavoro devono essere maggiori di zero.");
    }

    const notes = body.notes === undefined ? existing.notes || "" : body.notes;
    if (typeof notes !== "string" || notes.length > 2000) {
      throw new ValidationError("Note non valide (massimo 2000 caratteri).");
    }

    const materials = body.materials_used === undefined ? existing.materialsUsed : body.materials_used;
    if (!Array.isArray(materials)) {
      throw new ValidationError("materials_used deve essere un array.");
    }
    const safeMaterials: { name: string; quantity: number }[] = [];
    for (const material of materials) {
      if (!material || typeof material !== "object" || Array.isArray(material) ||
          Object.keys(material).some((key) => key !== "name" && key !== "quantity") ||
          typeof material.name !== "string" || !material.name.trim() || material.name.trim().length > 255 ||
          typeof material.quantity !== "number" || !Number.isFinite(material.quantity) ||
          !Number.isInteger(material.quantity) || material.quantity < 1) {
        throw new ValidationError("Materiale non valido: nome obbligatorio e quantità intera >= 1.");
      }
      safeMaterials.push({ name: material.name.trim(), quantity: material.quantity });
    }

    const materialsStatus = body.materials_status === undefined
      ? (existing.materialsStatus || "unverified")
      : body.materials_status;
    if (materialsStatus !== "used" && materialsStatus !== "none" && materialsStatus !== "unverified") {
      throw new ValidationError("Stato verifica materiali non valido.");
    }
    if (materialsStatus === "none" && safeMaterials.length > 0) {
      throw new ValidationError("Non è possibile indicare materiali utilizzati se la verifica conferma 'none'.");
    }
    if (materialsStatus === "used" && !safeMaterials.some((material) => material.quantity > 0)) {
      throw new ValidationError("Per dichiarare materiali utilizzati è necessario indicare almeno una quantità positiva.");
    }

    let signatureBase64 = existing.signatureBase64;
    if (body.signature_base64 !== undefined) {
      const signatureValidation = validateSignatureBase64(body.signature_base64);
      if (!signatureValidation.valid) {
        throw new AppError(signatureValidation.error, signatureValidation.status || 400);
      }
      signatureBase64 = body.signature_base64;
    }

    const result = await this.db.updateDraftReport(companyId, reportId, {
      date: targetDate,
      time: targetTime,
      workHours,
      travelHours,
      client: { name: clientName, address: clientAddress.trim(), city: clientCity.trim() },
      materialsStatus,
      materialsUsed: safeMaterials,
      notes,
      status,
      signatureBase64,
    });
    if (result.status === "not_found") {
      throw new NotFoundError("Rapportino non trovato o non accessibile.");
    }
    if (result.status === "not_draft") {
      throw new BadRequestError("Il rapportino non è più una bozza e non può essere modificato.");
    }
    return this.toResponseDTO(result.report);
  }

  /**
   * Delete a report strictly if it belongs to the tenant.
   * Enforces state integrity on linked interventions (preventing inconsistent billing readiness).
   * Atomically handled inside the database adapter within a single transaction.
   */
  async deleteReport(companyId: string, reportId: string, updatedBy?: string): Promise<void> {
    if (!companyId || !reportId) {
      throw new ValidationError("Report ID and Company ID are required");
    }

    const regressionNote = "[Sistema] Stato regredito a 'verificato' a seguito dell'eliminazione del rapportino collegato.";
    const result = await this.db.deleteReportWithInterventionRegression(
      companyId,
      reportId,
      regressionNote,
      updatedBy || "system"
    );

    if (result.status === "not_found") {
      throw new NotFoundError(
        "Rapportino non trovato o non appartenente alla tua azienda."
      );
    }

    if (result.status === "blocked_fatturato") {
      throw new BadRequestError(
        "Impossibile eliminare il rapportino: l'intervento collegato è già fatturato."
      );
    }
  }

  /**
   * Maps internal database record to safe response DTO.
   */
  private toResponseDTO(r: ReportRecord): ReportResponseDTO {
    return {
      id: r.id,
      customer_id: r.customerId,
      location_id: r.locationId,
      intervention_id: r.interventionId,
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
      materials_status: r.materialsStatus || "unverified",
      materials_used: r.materialsUsed,
      notes: r.notes,
      created_at: r.createdAt,
    };
  }
}
