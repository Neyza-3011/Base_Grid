import { IDatabaseAdapter } from "../db";
import { ReportRecord, CreateReportRequest, ReportResponseDTO } from "../types";
import { AppError, NotFoundError, ValidationError, ForbiddenError } from "../errors";
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
    return report;
  }

  /**
   * Create a new report with business validations and tenant assignment.
   */
  async createReport(
    companyId: string,
    creatorName: string,
    body: CreateReportRequest,
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
      materials_used,
      status,
      signature_base64,
      customer_id,
      location_id,
      intervention_id,
    } = body || {};

    // 1. Intervention validation (if specified)
    let validatedInterventionId: string | undefined = undefined;
    let interventionRecord: any = null;

    if (intervention_id !== undefined && intervention_id !== null && String(intervention_id).trim() !== "") {
      const rawInterventionId = typeof intervention_id === "string" ? intervention_id.trim() : String(intervention_id);
      interventionRecord = await this.db.getInterventionByIdAndCompany(rawInterventionId, companyId);
      if (!interventionRecord) {
        throw new NotFoundError("Intervento non trovato o non accessibile.");
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

    if (targetCustomerId) {
      customerRecord = await this.db.getCustomerByIdAndCompany(targetCustomerId, companyId);
      if (!customerRecord) {
        throw new NotFoundError("Cliente non trovato o non accessibile.");
      }
      validatedCustomerId = customerRecord.id;
    }

    if (targetLocationId) {
      locationRecord = await this.db.getLocationByIdAndCompany(targetLocationId, companyId);
      if (!locationRecord) {
        throw new NotFoundError("Sede o cantiere non trovato o non accessibile.");
      }
      validatedLocationId = locationRecord.id;
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

    // work_hours: required, finite, >= 0, <= 1000
    if (work_hours === undefined || work_hours === null) {
      throw new ValidationError("Ore di lavoro obbligatorie.");
    }
    const workHours =
      typeof work_hours === "number"
        ? work_hours
        : typeof work_hours === "string" && work_hours.trim() !== ""
        ? Number(work_hours)
        : NaN;
    if (!Number.isFinite(workHours) || workHours < 0 || workHours > 1000) {
      throw new ValidationError(
        "Ore di lavoro non valide (devono essere un numero compreso tra 0 e 1000)."
      );
    }

    // travel_hours: optional, finite, >= 0, <= 1000, defaults to 0
    let travelHours = 0;
    if (travel_hours !== undefined && travel_hours !== null) {
      const parsedTravel =
        typeof travel_hours === "number"
          ? travel_hours
          : typeof travel_hours === "string" && travel_hours.trim() !== ""
          ? Number(travel_hours)
          : NaN;
      if (!Number.isFinite(parsedTravel) || parsedTravel < 0 || parsedTravel > 1000) {
        throw new ValidationError(
          "Ore di viaggio non valide (devono essere un numero compreso tra 0 e 1000)."
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
          m.quantity < 0
        ) {
          throw new ValidationError(
            "Quantità materiale non valida (deve essere un numero finito >= 0)."
          );
        }
        safeMaterials.push({
          name: m.name.trim(),
          quantity: m.quantity,
        });
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
      materialsUsed: safeMaterials,
      notes: safeNotes,
      signatureBase64: safeSignature,
    });

    return this.toResponseDTO(newReport);
  }

  /**
   * Delete a report strictly if it belongs to the tenant.
   */
  async deleteReport(companyId: string, reportId: string): Promise<void> {
    if (!companyId || !reportId) {
      throw new ValidationError("Report ID and Company ID are required");
    }

    const deleted = await this.db.deleteReport(companyId, reportId);
    if (!deleted) {
      throw new NotFoundError(
        "Rapportino non trovato o non appartenente alla tua azienda."
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
      materials_used: r.materialsUsed,
      notes: r.notes,
      created_at: r.createdAt,
    };
  }
}
