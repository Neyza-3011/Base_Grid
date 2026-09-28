import { IDatabaseAdapter } from "../db";
import {
  CreateInterventionInput,
  InterventionPriority,
  InterventionRecord,
  InterventionResponse,
  InterventionStatus,
  TransitionInterventionInput,
  UpdateInterventionInput,
  VALID_INTERVENTION_PRIORITIES,
  VALID_INTERVENTION_STATUSES,
  VALID_STATUS_TRANSITIONS,
} from "../types";
import { BadRequestError, NotFoundError } from "../errors";

export interface GetInterventionsFilter {
  search?: string;
  status?: string;
  priority?: string;
  technicianId?: string;
  customerId?: string;
  locationId?: string;
  assetId?: string;
  scheduledStartFrom?: string;
  scheduledStartTo?: string;
  limit?: number;
  cursor?: string;
}

export class InterventionService {
  constructor(private db: IDatabaseAdapter) {}

  public async getInterventions(
    companyId: string,
    filters?: GetInterventionsFilter
  ): Promise<{ items: InterventionResponse[]; nextCursor?: string; totalCount?: number }> {
    const result = await this.db.getInterventionsByCompany(companyId, filters);

    // Enrich items with related names for UI convenience
    const enrichedItems: InterventionResponse[] = await Promise.all(
      result.items.map(async (item) => {
        const { companyId: _, ...rest } = item;
        let customerName: string | undefined;
        let locationName: string | undefined;
        let assetName: string | undefined;
        let technicianName: string | undefined;

        try {
          if (item.customerId) {
            const cust = await this.db.getCustomerByIdAndCompany(item.customerId, companyId);
            if (cust) customerName = cust.displayName;
          }
          if (item.locationId) {
            const loc = await this.db.getLocationByIdAndCompany(item.locationId, companyId);
            if (loc) locationName = loc.name;
          }
          if (item.assetId) {
            const ast = await this.db.getAssetByIdAndCompany(item.assetId, companyId);
            if (ast) assetName = ast.name;
          }
          if (item.technicianId) {
            const tech = await this.db.getUserByIdAndCompany(item.technicianId, companyId);
            if (tech) technicianName = tech.fullName;
          }
        } catch {
          // Non-blocking enrichment failure
        }

        return {
          ...rest,
          customerName,
          locationName,
          assetName,
          technicianName,
        };
      })
    );

    return {
      items: enrichedItems,
      nextCursor: result.nextCursor,
      totalCount: result.totalCount,
    };
  }

  public async getInterventionById(
    companyId: string,
    interventionId: string
  ): Promise<InterventionResponse> {
    const item = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!item) {
      throw new NotFoundError("Intervento non trovato.");
    }

    const { companyId: _, ...rest } = item;
    let customerName: string | undefined;
    let locationName: string | undefined;
    let assetName: string | undefined;
    let technicianName: string | undefined;

    try {
      if (item.customerId) {
        const cust = await this.db.getCustomerByIdAndCompany(item.customerId, companyId);
        if (cust) customerName = cust.displayName;
      }
      if (item.locationId) {
        const loc = await this.db.getLocationByIdAndCompany(item.locationId, companyId);
        if (loc) locationName = loc.name;
      }
      if (item.assetId) {
        const ast = await this.db.getAssetByIdAndCompany(item.assetId, companyId);
        if (ast) assetName = ast.name;
      }
      if (item.technicianId) {
        const tech = await this.db.getUserByIdAndCompany(item.technicianId, companyId);
        if (tech) technicianName = tech.fullName;
      }
    } catch {
      // Non-blocking enrichment
    }

    return {
      ...rest,
      customerName,
      locationName,
      assetName,
      technicianName,
    };
  }

  public async createIntervention(
    companyId: string,
    createdBy: string,
    input: CreateInterventionInput
  ): Promise<InterventionRecord> {
    // 1. Validate required fields
    if (!input.description || typeof input.description !== "string" || input.description.trim().length < 2) {
      throw new BadRequestError("La descrizione dell'intervento è obbligatoria e deve avere almeno 2 caratteri.");
    }

    if (!input.customerId || typeof input.customerId !== "string" || input.customerId.trim().length === 0) {
      throw new BadRequestError("Il cliente è obbligatorio.");
    }

    if (!input.locationId || typeof input.locationId !== "string" || input.locationId.trim().length === 0) {
      throw new BadRequestError("La sede/cantiere è obbligatoria.");
    }

    const priority: InterventionPriority = input.priority || "media";
    if (!VALID_INTERVENTION_PRIORITIES.includes(priority)) {
      throw new BadRequestError(
        `Priorità non valida. Priorità supportate: ${VALID_INTERVENTION_PRIORITIES.join(", ")}`
      );
    }

    const cleanCustomerId = input.customerId.trim();
    const cleanLocationId = input.locationId.trim();

    // 2. Validate Customer belongs to company
    const customer = await this.db.getCustomerByIdAndCompany(cleanCustomerId, companyId);
    if (!customer) {
      throw new NotFoundError("Cliente non trovato.");
    }

    // 3. Validate Location belongs to company and belongs to customer
    const location = await this.db.getLocationByIdAndCompany(cleanLocationId, companyId);
    if (!location) {
      throw new NotFoundError("Sede/Cantiere non trovata.");
    }
    if (location.customerId !== cleanCustomerId) {
      throw new BadRequestError("La sede selezionata non appartiene al cliente indicato.");
    }

    // 4. Validate Asset (if present)
    let cleanAssetId: string | undefined = undefined;
    if (input.assetId && typeof input.assetId === "string" && input.assetId.trim().length > 0) {
      cleanAssetId = input.assetId.trim();
      const asset = await this.db.getAssetByIdAndCompany(cleanAssetId, companyId);
      if (!asset) {
        throw new NotFoundError("Impianto/Asset non trovato.");
      }
      if (asset.customerId !== cleanCustomerId || asset.locationId !== cleanLocationId) {
        throw new BadRequestError("L'impianto selezionato non appartiene al cliente e alla sede indicati.");
      }
    }

    // 5. Validate Technician (if present)
    let cleanTechnicianId: string | undefined = undefined;
    if (input.technicianId && typeof input.technicianId === "string" && input.technicianId.trim().length > 0) {
      cleanTechnicianId = input.technicianId.trim();
      const tech = await this.db.getUserByIdAndCompany(cleanTechnicianId, companyId);
      if (!tech) {
        throw new NotFoundError("Tecnico non trovato.");
      }
      if (!tech.isActive) {
        throw new BadRequestError("Il tecnico selezionato non è attivo.");
      }
      if (tech.role !== "technician") {
        throw new BadRequestError("L'utente selezionato non ha il ruolo di tecnico.");
      }
    }

    // 6. Validate Scheduled Dates
    if (input.scheduledStart && input.scheduledEnd) {
      const startDate = new Date(input.scheduledStart);
      const endDate = new Date(input.scheduledEnd);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestError("Formato data programmata non valido.");
      }
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestError("La data di fine intervento programmata deve essere successiva alla data di inizio.");
      }
    } else if (input.scheduledStart) {
      if (isNaN(new Date(input.scheduledStart).getTime())) {
        throw new BadRequestError("Formato data inizio programmata non valido.");
      }
    } else if (input.scheduledEnd) {
      if (isNaN(new Date(input.scheduledEnd).getTime())) {
        throw new BadRequestError("Formato data fine programmata non valido.");
      }
    }

    // 7. Validate Estimated Hours
    if (input.estimatedHours !== undefined && input.estimatedHours !== null) {
      if (typeof input.estimatedHours !== "number" || !isFinite(input.estimatedHours) || input.estimatedHours < 0) {
        throw new BadRequestError("Le ore stimate devono essere un numero maggiore o uguale a 0.");
      }
    }

    // Server-authoritative: Status is ALWAYS "nuovo" on creation
    return await this.db.createIntervention(companyId, {
      customerId: cleanCustomerId,
      locationId: cleanLocationId,
      assetId: cleanAssetId,
      description: input.description.trim(),
      problem: input.problem ? input.problem.trim() : undefined,
      priority,
      status: "nuovo",
      scheduledStart: input.scheduledStart || undefined,
      scheduledEnd: input.scheduledEnd || undefined,
      technicianId: cleanTechnicianId,
      estimatedHours: input.estimatedHours !== undefined && input.estimatedHours !== null ? input.estimatedHours : undefined,
      notes: input.notes ? input.notes.trim() : undefined,
      createdBy,
      updatedBy: createdBy,
    });
  }

  public async updateIntervention(
    companyId: string,
    updatedBy: string,
    interventionId: string,
    input: UpdateInterventionInput
  ): Promise<InterventionRecord> {
    const existing = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!existing) {
      throw new NotFoundError("Intervento non trovato.");
    }

    const updates: Partial<InterventionRecord> & { updatedBy: string } = {
      updatedBy,
    };

    if (input.description !== undefined) {
      if (typeof input.description !== "string" || input.description.trim().length < 2) {
        throw new BadRequestError("La descrizione dell'intervento deve avere almeno 2 caratteri.");
      }
      updates.description = input.description.trim();
    }

    if (input.problem !== undefined) {
      updates.problem = input.problem ? input.problem.trim() : undefined;
    }

    if (input.priority !== undefined) {
      if (!VALID_INTERVENTION_PRIORITIES.includes(input.priority)) {
        throw new BadRequestError(
          `Priorità non valida. Priorità supportate: ${VALID_INTERVENTION_PRIORITIES.join(", ")}`
        );
      }
      updates.priority = input.priority;
    }

    const targetCustomerId = input.customerId !== undefined ? input.customerId.trim() : existing.customerId;
    const targetLocationId = input.locationId !== undefined ? input.locationId.trim() : existing.locationId;

    if (input.customerId !== undefined) {
      if (!input.customerId || input.customerId.trim().length === 0) {
        throw new BadRequestError("Il cliente non può essere vuoto.");
      }
      const customer = await this.db.getCustomerByIdAndCompany(targetCustomerId, companyId);
      if (!customer) {
        throw new NotFoundError("Cliente non trovato.");
      }
      updates.customerId = targetCustomerId;
    }

    if (input.locationId !== undefined || input.customerId !== undefined) {
      if (!targetLocationId || targetLocationId.length === 0) {
        throw new BadRequestError("La sede/cantiere non può essere vuota.");
      }
      const location = await this.db.getLocationByIdAndCompany(targetLocationId, companyId);
      if (!location) {
        throw new NotFoundError("Sede/Cantiere non trovata.");
      }
      if (location.customerId !== targetCustomerId) {
        throw new BadRequestError("La sede selezionata non appartiene al cliente indicato.");
      }
      updates.locationId = targetLocationId;
    }

    // Asset validation
    if (input.assetId !== undefined) {
      if (input.assetId === null || input.assetId.trim().length === 0) {
        updates.assetId = undefined;
      } else {
        const cleanAssetId = input.assetId.trim();
        const asset = await this.db.getAssetByIdAndCompany(cleanAssetId, companyId);
        if (!asset) {
          throw new NotFoundError("Impianto/Asset non trovato.");
        }
        if (asset.customerId !== targetCustomerId || asset.locationId !== targetLocationId) {
          throw new BadRequestError("L'impianto selezionato non appartiene al cliente e alla sede indicati.");
        }
        updates.assetId = cleanAssetId;
      }
    }

    // Technician validation
    if (input.technicianId !== undefined) {
      if (input.technicianId === null || input.technicianId.trim().length === 0) {
        updates.technicianId = undefined;
      } else {
        const cleanTechnicianId = input.technicianId.trim();
        const tech = await this.db.getUserByIdAndCompany(cleanTechnicianId, companyId);
        if (!tech) {
          throw new NotFoundError("Tecnico non trovato.");
        }
        if (!tech.isActive) {
          throw new BadRequestError("Il tecnico selezionato non è attivo.");
        }
        if (tech.role !== "technician") {
          throw new BadRequestError("L'utente selezionato non ha il ruolo di tecnico.");
        }
        updates.technicianId = cleanTechnicianId;
      }
    }

    // Dates validation
    const targetStart = input.scheduledStart !== undefined ? input.scheduledStart : existing.scheduledStart;
    const targetEnd = input.scheduledEnd !== undefined ? input.scheduledEnd : existing.scheduledEnd;

    if (targetStart && targetEnd) {
      const startDate = new Date(targetStart);
      const endDate = new Date(targetEnd);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestError("Formato data programmata non valido.");
      }
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestError("La data di fine intervento programmata deve essere successiva alla data di inizio.");
      }
    }
    if (input.scheduledStart !== undefined) updates.scheduledStart = input.scheduledStart || undefined;
    if (input.scheduledEnd !== undefined) updates.scheduledEnd = input.scheduledEnd || undefined;

    if (input.estimatedHours !== undefined) {
      if (input.estimatedHours !== null) {
        if (typeof input.estimatedHours !== "number" || !isFinite(input.estimatedHours) || input.estimatedHours < 0) {
          throw new BadRequestError("Le ore stimate devono essere un numero maggiore o uguale a 0.");
        }
        updates.estimatedHours = input.estimatedHours;
      } else {
        updates.estimatedHours = undefined;
      }
    }

    if (input.actualHours !== undefined) {
      if (input.actualHours !== null) {
        if (typeof input.actualHours !== "number" || !isFinite(input.actualHours) || input.actualHours < 0) {
          throw new BadRequestError("Le ore effettive devono essere un numero maggiore o uguale a 0.");
        }
        updates.actualHours = input.actualHours;
      } else {
        updates.actualHours = undefined;
      }
    }

    if (input.notes !== undefined) {
      updates.notes = input.notes ? input.notes.trim() : undefined;
    }

    const updated = await this.db.updateIntervention(companyId, interventionId, updates);
    if (!updated) {
      throw new NotFoundError("Intervento non trovato.");
    }
    return updated;
  }

  public async transitionStatus(
    companyId: string,
    updatedBy: string,
    interventionId: string,
    input: TransitionInterventionInput
  ): Promise<InterventionRecord> {
    const existing = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!existing) {
      throw new NotFoundError("Intervento non trovato.");
    }

    if (!input.targetStatus || !VALID_INTERVENTION_STATUSES.includes(input.targetStatus)) {
      throw new BadRequestError(`Stato di destinazione non valido: ${input.targetStatus}`);
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(input.targetStatus)) {
      throw new BadRequestError(
        `Transizione di stato non consentita da '${existing.status}' a '${input.targetStatus}'.`
      );
    }

    const updates: Partial<InterventionRecord> & { updatedBy: string } = {
      status: input.targetStatus,
      updatedBy,
    };

    // Transition rule: "da_assegnare" -> "assegnato" requires a valid technician
    if (input.targetStatus === "assegnato") {
      let techIdToAssign = input.technicianId ? input.technicianId.trim() : existing.technicianId;
      if (!techIdToAssign) {
        throw new BadRequestError("L'assegnazione dell'intervento richiede un tecnico valido.");
      }

      // Validate the technician
      const tech = await this.db.getUserByIdAndCompany(techIdToAssign, companyId);
      if (!tech) {
        throw new NotFoundError("Tecnico non trovato.");
      }
      if (!tech.isActive) {
        throw new BadRequestError("Il tecnico selezionato non è attivo.");
      }
      if (tech.role !== "technician") {
        throw new BadRequestError("L'utente selezionato non ha il ruolo di tecnico.");
      }
      updates.technicianId = techIdToAssign;
    } else if (input.technicianId) {
      const cleanTechnicianId = input.technicianId.trim();
      const tech = await this.db.getUserByIdAndCompany(cleanTechnicianId, companyId);
      if (!tech) {
        throw new NotFoundError("Tecnico non trovato.");
      }
      if (!tech.isActive) {
        throw new BadRequestError("Il tecnico selezionato non è attivo.");
      }
      if (tech.role !== "technician") {
        throw new BadRequestError("L'utente selezionato non ha il ruolo di tecnico.");
      }
      updates.technicianId = cleanTechnicianId;
    }

    if (input.actualHours !== undefined && input.actualHours !== null) {
      if (typeof input.actualHours !== "number" || !isFinite(input.actualHours) || input.actualHours < 0) {
        throw new BadRequestError("Le ore effettive devono essere un numero maggiore o uguale a 0.");
      }
      updates.actualHours = input.actualHours;
    }

    if (input.notes !== undefined && input.notes !== null) {
      updates.notes = input.notes.trim();
    }

    const updated = await this.db.updateIntervention(companyId, interventionId, updates);
    if (!updated) {
      throw new NotFoundError("Intervento non trovato.");
    }
    return updated;
  }
}
