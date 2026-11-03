import { calculateJobCompleteScore, JobCompleteScoreResult } from "./job-complete-score.domain";
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
  TECHNICIAN_ALLOWED_STATUS_TRANSITIONS,
  UserRole,
} from "../types";
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from "../errors";

function validateInputObject(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestError("Dati intervento non validi.");
  }
}

function validateOptionalStringField(value: unknown, field: string, nullable = false): void {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string") {
    throw new BadRequestError(`${field} deve essere una stringa valida.`);
  }
}

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
    filters?: GetInterventionsFilter,
    actor?: { id: string; role: UserRole }
  ): Promise<{ items: InterventionResponse[]; nextCursor?: string; totalCount?: number }> {
    const effectiveFilters: GetInterventionsFilter = { ...filters };
    if (actor && actor.role === "technician") {
      effectiveFilters.technicianId = actor.id;
    }

    if (effectiveFilters.scheduledStartFrom && isNaN(new Date(effectiveFilters.scheduledStartFrom).getTime())) {
      throw new BadRequestError("Formato data inizio ricerca non valido.");
    }
    if (effectiveFilters.scheduledStartTo && isNaN(new Date(effectiveFilters.scheduledStartTo).getTime())) {
      throw new BadRequestError("Formato data fine ricerca non valido.");
    }
    if (effectiveFilters.scheduledStartFrom && effectiveFilters.scheduledStartTo) {
      const startFromTime = new Date(effectiveFilters.scheduledStartFrom).getTime();
      const startToTime = new Date(effectiveFilters.scheduledStartTo).getTime();
      if (startToTime < startFromTime) {
        throw new BadRequestError("La data di inizio ricerca deve essere antecedente o uguale alla data di fine.");
      }
    }

    const result = await this.db.getInterventionsByCompany(companyId, effectiveFilters);

    // Collect distinct entity IDs across all items in the list to avoid N+1 queries
    const customerIds = new Set<string>();
    const locationIds = new Set<string>();
    const assetIds = new Set<string>();
    const technicianIds = new Set<string>();

    for (const item of result.items) {
      if (item.customerId) customerIds.add(item.customerId);
      if (item.locationId) locationIds.add(item.locationId);
      if (item.assetId) assetIds.add(item.assetId);
      if (item.technicianId) technicianIds.add(item.technicianId);
    }

    // Each relation type is fetched with one tenant-scoped adapter query per page.
    // Database read failures must propagate instead of returning a successful but
    // misleading response with silently missing customer/location/technician data.
    const [customers, locations, assets, technicians, reports] = await Promise.all([
      this.db.getCustomersByIdsAndCompany(Array.from(customerIds), companyId),
      this.db.getLocationsByIdsAndCompany(Array.from(locationIds), companyId),
      this.db.getAssetsByIdsAndCompany(Array.from(assetIds), companyId),
      this.db.getUsersByIdsAndCompany(Array.from(technicianIds), companyId),
      this.db.getReportsByInterventionIdsAndCompany(result.items.map((item) => item.id), companyId),
    ]);

    // Build fast request-scoped O(1) lookup maps
    const customerMap = new Map<string, any>();
    for (const c of customers) {
      if (c) customerMap.set(c.id, c);
    }

    const locationMap = new Map<string, any>();
    for (const l of locations) {
      if (l) locationMap.set(l.id, l);
    }

    const assetMap = new Map<string, any>();
    for (const a of assets) {
      if (a) assetMap.set(a.id, a);
    }

    const technicianMap = new Map<string, any>();
    for (const t of technicians) {
      if (t) technicianMap.set(t.id, t);
    }

    const reportMap = new Map<string, any>();
    for (const report of reports) {
      // Match the previous single-report lookup contract: use at most one report
      // for each intervention, without changing response shape or score semantics.
      if (report.interventionId && !reportMap.has(report.interventionId)) {
        reportMap.set(report.interventionId, report);
      }
    }

    // Enrich items using request-scoped lookup maps in O(1) time
    const enrichedItems: InterventionResponse[] = result.items.map((item) => {
      const { companyId: _, ...rest } = item;

      const cust = item.customerId ? customerMap.get(item.customerId) : undefined;
      const customerName = cust?.displayName;
      const customerPhone = cust?.phoneNumber;

      const loc = item.locationId ? locationMap.get(item.locationId) : undefined;
      const locationName = loc?.name;
      const locationAddress = loc?.address;
      const locationCity = loc?.city;

      const ast = item.assetId ? assetMap.get(item.assetId) : undefined;
      const assetName = ast?.name;

      const tech = item.technicianId ? technicianMap.get(item.technicianId) : undefined;
      const technicianName = tech?.fullName;

      const report = reportMap.get(item.id) || null;
      const asset = ast || null; // Reuse cached asset reference without re-querying DB
      const jobCompleteScore = calculateJobCompleteScore(item, report, asset);

      return {
        ...rest,
        jobCompleteScore,
        customerName,
        customerPhone,
        locationName,
        locationAddress,
        locationCity,
        assetName,
        technicianName,
      };
    });

    return {
      items: enrichedItems,
      nextCursor: result.nextCursor,
      totalCount: result.totalCount,
    };
  }

  public async getInterventionById(
    companyId: string,
    interventionId: string,
    actor?: { id: string; role: UserRole }
  ): Promise<InterventionResponse> {
    const item = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!item) {
      throw new NotFoundError("Intervento non trovato.");
    }

    // A technician can only retrieve the details of an intervention assigned to them
    if (actor && actor.role === "technician" && item.technicianId !== actor.id) {
      throw new NotFoundError("Intervento non trovato.");
    }

    const { companyId: _, ...rest } = item;
    let customerName: string | undefined;
    let customerPhone: string | undefined;
    let locationName: string | undefined;
    let locationAddress: string | undefined;
    let locationCity: string | undefined;
    let assetName: string | undefined;
    let technicianName: string | undefined;

    if (item.customerId) {
      const cust = await this.db.getCustomerByIdAndCompany(item.customerId, companyId);
      if (cust) {
        customerName = cust.displayName;
        customerPhone = cust.phoneNumber;
      }
    }
    if (item.locationId) {
      const loc = await this.db.getLocationByIdAndCompany(item.locationId, companyId);
      if (loc) {
        locationName = loc.name;
        locationAddress = loc.address;
        locationCity = loc.city;
      }
    }
    if (item.assetId) {
      const ast = await this.db.getAssetByIdAndCompany(item.assetId, companyId);
      if (ast) assetName = ast.name;
    }
    if (item.technicianId) {
      const tech = await this.db.getUserByIdAndCompany(item.technicianId, companyId);
      if (tech) technicianName = tech.fullName;
    }

    const report = await this.db.getReportByInterventionId(companyId, interventionId);
    const asset = item.assetId ? await this.db.getAssetByIdAndCompany(item.assetId, companyId) : null;
    const jobCompleteScore = calculateJobCompleteScore(item, report, asset);

    return {
      ...rest,
      jobCompleteScore,
      customerName,
      customerPhone,
      locationName,
      locationAddress,
      locationCity,
      assetName,
      technicianName,
    };
  }

  public async createIntervention(
    companyId: string,
    createdBy: string,
    input: CreateInterventionInput
  ): Promise<InterventionRecord> {
    validateInputObject(input);
    // Validate runtime input types before calling string methods or date parsing.
    validateOptionalStringField(input.assetId, "L'impianto", true);
    validateOptionalStringField(input.problem, "Il problema", true);
    validateOptionalStringField(input.scheduledStart, "La data di inizio", true);
    validateOptionalStringField(input.scheduledEnd, "La data di fine", true);
    validateOptionalStringField(input.technicianId, "Il tecnico", true);
    validateOptionalStringField(input.notes, "Le note", true);

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
    if (input.scheduledStart && isNaN(new Date(input.scheduledStart).getTime())) {
      throw new BadRequestError("Formato data inizio programmata non valido.");
    }
    if (input.scheduledEnd && isNaN(new Date(input.scheduledEnd).getTime())) {
      throw new BadRequestError("Formato data fine programmata non valido.");
    }
    if (input.scheduledStart && input.scheduledEnd) {
      const startDate = new Date(input.scheduledStart);
      const endDate = new Date(input.scheduledEnd);
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestError("La data di fine intervento programmata deve essere successiva alla data di inizio.");
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
    validateInputObject(input);
    // Request bodies are untrusted at runtime even when TypeScript interfaces are used.
    validateOptionalStringField(input.customerId, "Il cliente");
    validateOptionalStringField(input.locationId, "La sede/cantiere");
    validateOptionalStringField(input.assetId, "L'impianto", true);
    validateOptionalStringField(input.technicianId, "Il tecnico", true);
    validateOptionalStringField(input.problem, "Il problema", true);
    validateOptionalStringField(input.scheduledStart, "La data di inizio", true);
    validateOptionalStringField(input.scheduledEnd, "La data di fine", true);
    validateOptionalStringField(input.notes, "Le note", true);

    const existing = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!existing) {
      throw new NotFoundError("Intervento non trovato.");
    }

    if (existing.status === "fatturato") {
      throw new BadRequestError("Impossibile modificare un intervento già fatturato.");
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
      updates.problem = input.problem && typeof input.problem === "string" && input.problem.trim().length > 0
        ? input.problem.trim()
        : (null as any);
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
        updates.assetId = null as any;
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
    } else if (existing.assetId && (targetCustomerId !== existing.customerId || targetLocationId !== existing.locationId)) {
      const asset = await this.db.getAssetByIdAndCompany(existing.assetId, companyId);
      if (!asset || asset.customerId !== targetCustomerId || asset.locationId !== targetLocationId) {
        throw new BadRequestError("L'impianto selezionato non appartiene al cliente e alla sede indicati.");
      }
    }

    // Technician validation
    if (input.technicianId !== undefined) {
      if (input.technicianId === null || input.technicianId.trim().length === 0) {
        updates.technicianId = null as any;
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
    const targetStart = input.scheduledStart !== undefined ? (input.scheduledStart || undefined) : existing.scheduledStart;
    const targetEnd = input.scheduledEnd !== undefined ? (input.scheduledEnd || undefined) : existing.scheduledEnd;

    if (targetStart && isNaN(new Date(targetStart).getTime())) {
      throw new BadRequestError("Formato data inizio programmata non valido.");
    }
    if (targetEnd && isNaN(new Date(targetEnd).getTime())) {
      throw new BadRequestError("Formato data fine programmata non valido.");
    }
    if (targetStart && targetEnd) {
      const startDate = new Date(targetStart);
      const endDate = new Date(targetEnd);
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestError("La data di fine intervento programmata deve essere successiva alla data di inizio.");
      }
    }
    if (input.scheduledStart !== undefined) {
      updates.scheduledStart = input.scheduledStart && typeof input.scheduledStart === "string" && input.scheduledStart.trim().length > 0
        ? input.scheduledStart.trim()
        : (null as any);
    }
    if (input.scheduledEnd !== undefined) {
      updates.scheduledEnd = input.scheduledEnd && typeof input.scheduledEnd === "string" && input.scheduledEnd.trim().length > 0
        ? input.scheduledEnd.trim()
        : (null as any);
    }

    if (input.estimatedHours !== undefined) {
      if (input.estimatedHours !== null) {
        if (typeof input.estimatedHours !== "number" || !isFinite(input.estimatedHours) || input.estimatedHours < 0) {
          throw new BadRequestError("Le ore stimate devono essere un numero maggiore o uguale a 0.");
        }
        updates.estimatedHours = input.estimatedHours;
      } else {
        updates.estimatedHours = null as any;
      }
    }

    if (input.actualHours !== undefined) {
      if (input.actualHours !== null) {
        if (typeof input.actualHours !== "number" || !isFinite(input.actualHours) || input.actualHours < 0) {
          throw new BadRequestError("Le ore effettive devono essere un numero maggiore o uguale a 0.");
        }
        updates.actualHours = input.actualHours;
      } else {
        updates.actualHours = null as any;
      }
    }

    if (input.notes !== undefined) {
      updates.notes = input.notes && typeof input.notes === "string" && input.notes.trim().length > 0
        ? input.notes.trim()
        : (null as any);
    }

    const candidateRecord: InterventionRecord = {
      ...existing,
      ...updates,
    };

    if (existing.status === "pronto_per_fatturazione") {
      const report = await this.db.getReportByInterventionId(companyId, interventionId);
      const asset = candidateRecord.assetId
        ? await this.db.getAssetByIdAndCompany(candidateRecord.assetId, companyId)
        : null;

      const scoreResult = calculateJobCompleteScore(candidateRecord, report, asset);

      if (!scoreResult.readyForBilling) {
        // Controlled regression towards valid status "verificato"
        updates.status = "verificato";
        const missingReasons = scoreResult.checks
          .filter((c) => c.isMandatory && !c.passed)
          .map((c) => c.missingDataReason || c.label);
        const regressionNote = `[Sistema] Stato regredito da 'pronto_per_fatturazione' a 'verificato' per decadenza requisiti obbligatori: ${missingReasons.join(" - ")}`;
        updates.notes = candidateRecord.notes
          ? `${candidateRecord.notes}\n\n${regressionNote}`
          : regressionNote;
      }
    }

    // Compare-and-set prevents concurrent requests from applying transitions
    // validated against the same stale status.
    const updated = await this.db.updateIntervention(companyId, interventionId, updates, existing.status);
    if (!updated) {
      const current = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
      if (!current) {
        throw new NotFoundError("Intervento non trovato.");
      }
      throw new ConflictError("Lo stato dell'intervento è cambiato durante l'operazione. Ricarica e riprova.");
    }
    return updated;
  }

  public async getInterventionScore(
    companyId: string,
    interventionId: string,
    actor?: { id: string; role: UserRole }
  ): Promise<JobCompleteScoreResult> {
    const item = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!item) {
      throw new NotFoundError("Intervento non trovato.");
    }

    if (actor && actor.role === "technician" && item.technicianId !== actor.id) {
      throw new NotFoundError("Intervento non trovato.");
    }

    const report = await this.db.getReportByInterventionId(companyId, interventionId);
    const asset = item.assetId ? await this.db.getAssetByIdAndCompany(item.assetId, companyId) : null;

    return calculateJobCompleteScore(item, report, asset);
  }

  public async transitionStatus(
    companyId: string,
    updatedBy: string,
    interventionId: string,
    input: TransitionInterventionInput,
    actor?: { id: string; role: UserRole }
  ): Promise<InterventionRecord> {
    validateInputObject(input);
    if (typeof input.targetStatus !== "string") {
      throw new BadRequestError("Lo stato di destinazione deve essere una stringa valida.");
    }
    validateOptionalStringField(input.technicianId, "Il tecnico", true);
    validateOptionalStringField(input.notes, "Le note", true);
    const existing = await this.db.getInterventionByIdAndCompany(interventionId, companyId);
    if (!existing) {
      throw new NotFoundError("Intervento non trovato.");
    }

    if (existing.status === "fatturato") {
      throw new BadRequestError("L'intervento è già fatturato e non può subire ulteriori transizioni.");
    }

    // Role-specific enforcement for technicians
    if (actor && actor.role === "technician") {
      // 1. Technician can only update their own assigned intervention
      if (existing.technicianId !== actor.id) {
        throw new ForbiddenError("Non autorizzato ad aggiornare questo intervento.");
      }

      // 2. Technician cannot set, assign, or change technicianId
      if (input.technicianId !== undefined) {
        throw new ForbiddenError("Il tecnico non può assegnare o riassegnare tecnici.");
      }

      // 3. Technician can only execute permitted operational transitions
      const allowedForTech = TECHNICIAN_ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
      if (!allowedForTech.includes(input.targetStatus)) {
        throw new ForbiddenError(
          `Transizione di stato a '${input.targetStatus}' non consentita per il ruolo tecnico.`
        );
      }
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
      if (actor && actor.role === "technician") {
        if (input.targetStatus !== "in_lavorazione" && input.targetStatus !== "completato") {
          throw new BadRequestError(
            "Le ore effettive possono essere registrate dal tecnico soltanto durante le transizioni a 'in_lavorazione' o 'completato'."
          );
        }
      }

      if (typeof input.actualHours !== "number" || !isFinite(input.actualHours) || input.actualHours < 0) {
        throw new BadRequestError("Le ore effettive devono essere un numero maggiore o uguale a 0.");
      }
      updates.actualHours = input.actualHours;
    }

    if (input.notes !== undefined && input.notes !== null) {
      const trimmedNotes = input.notes.trim();
      if (trimmedNotes.length > 0) {
        if (actor && actor.role === "technician") {
          const timestamp = new Date().toISOString();
          const newEntry = `[${timestamp}] ${trimmedNotes}`;
          updates.notes = existing.notes ? `${existing.notes}\n\n${newEntry}` : newEntry;
        } else {
          updates.notes = trimmedNotes;
        }
      }
    }

    const candidateRecord: InterventionRecord = {
      ...existing,
      ...updates,
    };

    // Completing field work requires a positive, persisted actual-hours value.
    // The technician may enter it during "in_lavorazione" or at completion.
    if (
      input.targetStatus === "completato" &&
      (typeof candidateRecord.actualHours !== "number" ||
        !Number.isFinite(candidateRecord.actualHours) ||
        candidateRecord.actualHours <= 0)
    ) {
      throw new BadRequestError(
        "Per completare l'intervento è necessario registrare ore effettive maggiori di zero."
      );
    }

    if (input.targetStatus === "pronto_per_fatturazione") {
      const report = await this.db.getReportByInterventionId(companyId, interventionId);
      const asset = candidateRecord.assetId
        ? await this.db.getAssetByIdAndCompany(candidateRecord.assetId, companyId)
        : null;

      const scoreResult = calculateJobCompleteScore(candidateRecord, report, asset);

      if (!scoreResult.readyForBilling) {
        const missingReasons = scoreResult.checks
          .filter((c) => c.isMandatory && !c.passed)
          .map((c) => c.missingDataReason || c.label);

        throw new BadRequestError(
          `Impossibile portare l'intervento nello stato 'pronto_per_fatturazione': controlli obbligatori non soddisfatti. ${missingReasons.join(" - ")}`
        );
      }
    }

    const updated = await this.db.updateIntervention(companyId, interventionId, updates);
    if (!updated) {
      throw new NotFoundError("Intervento non trovato.");
    }
    return updated;
  }
}
