import { IDatabaseAdapter } from "../db";
import {
  AssetRecord,
  AssetStatus,
  AssetType,
  CreateAssetInput,
  UpdateAssetInput,
} from "../types";
import { BadRequestError, NotFoundError } from "../errors";
import { isValidCalendarDate } from "../validation";

function validateInputObject(input: unknown, entityName = "I dati asset"): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestError(`${entityName} inviati non sono validi.`);
  }
}

function validateOptionalStringField(value: unknown, fieldName: string, nullable = false): void {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} deve essere una stringa valida.`);
  }
}

function validateColumnLength(value: unknown, fieldName: string, maxLength: number): void {
  if (typeof value === "string" && value.length > maxLength) {
    throw new BadRequestError(`${fieldName} non può superare ${maxLength} caratteri.`);
  }
}

export const VALID_ASSET_TYPES: readonly AssetType[] = [
  "quadro",
  "fotovoltaico",
  "inverter",
  "batteria",
  "wallbox",
  "climatizzazione",
  "automazione",
  "allarme",
  "rete_cablaggio",
  "altro",
] as const;

export const VALID_ASSET_STATUSES: readonly AssetStatus[] = [
  "operativo",
  "manutenzione",
  "fuori_servizio",
  "dismesso",
] as const;

export interface GetAssetsFilter {
  search?: string;
  customerId?: string;
  locationId?: string;
  assetType?: AssetType;
  status?: AssetStatus;
  activeOnly?: boolean;
  limit?: number;
}

export class AssetService {
  constructor(private db: IDatabaseAdapter) {}

  public async getAssets(
    companyId: string,
    filters?: GetAssetsFilter
  ): Promise<AssetRecord[]> {
    return await this.db.getAssetsByCompany(companyId, filters);
  }

  public async getAssetById(companyId: string, assetId: string): Promise<AssetRecord> {
    const asset = await this.db.getAssetByIdAndCompany(assetId, companyId);
    if (!asset) {
      throw new NotFoundError("Impianto/Asset non trovato.");
    }
    return asset;
  }

  public async createAsset(
    companyId: string,
    input: CreateAssetInput
  ): Promise<AssetRecord> {
    validateInputObject(input, "I dati impianto/asset");
    validateOptionalStringField(input.manufacturer, "Produttore", true);
    validateColumnLength(input.manufacturer, "Produttore", 255);
    validateOptionalStringField(input.model, "Modello", true);
    validateColumnLength(input.model, "Modello", 255);
    validateOptionalStringField(input.serialNumber, "Numero di serie", true);
    validateColumnLength(input.serialNumber, "Numero di serie", 255);
    validateOptionalStringField(input.installationDate, "Data di installazione", true);
    validateColumnLength(input.installationDate, "Data di installazione", 50);
    validateOptionalStringField(input.warrantyEndDate, "Data fine garanzia", true);
    validateColumnLength(input.warrantyEndDate, "Data fine garanzia", 50);
    validateOptionalStringField(input.notes, "Note", true);

    // 1. Validate required fields
    validateColumnLength(input.name, "Nome impianto/asset", 255);
    if (!input.name || typeof input.name !== "string" || input.name.trim().length < 2) {
      throw new BadRequestError("Il nome dell'impianto/asset è obbligatorio e deve avere almeno 2 caratteri.");
    }

    if (!input.customerId || typeof input.customerId !== "string" || input.customerId.trim().length === 0) {
      throw new BadRequestError("Il cliente è obbligatorio.");
    }

    if (!input.locationId || typeof input.locationId !== "string" || input.locationId.trim().length === 0) {
      throw new BadRequestError("La sede/cantiere è obbligatoria.");
    }

    if (!input.assetType || !VALID_ASSET_TYPES.includes(input.assetType)) {
      throw new BadRequestError(
        `Tipo impianto non valido. Tipi supportati: ${VALID_ASSET_TYPES.join(", ")}`
      );
    }

    const status: AssetStatus = input.status || "operativo";
    if (!VALID_ASSET_STATUSES.includes(status)) {
      throw new BadRequestError(
        `Stato impianto non valido. Stati supportati: ${VALID_ASSET_STATUSES.join(", ")}`
      );
    }

    if (input.installationDate && typeof input.installationDate === "string" && input.installationDate.trim().length > 0) {
      if (!isValidCalendarDate(input.installationDate.trim())) {
        throw new BadRequestError("Data di installazione non valida. Formato richiesto: YYYY-MM-DD.");
      }
    }

    if (input.warrantyEndDate && typeof input.warrantyEndDate === "string" && input.warrantyEndDate.trim().length > 0) {
      if (!isValidCalendarDate(input.warrantyEndDate.trim())) {
        throw new BadRequestError("Data fine garanzia non valida. Formato richiesto: YYYY-MM-DD.");
      }
    }

    const cleanCustomerId = input.customerId.trim();
    const cleanLocationId = input.locationId.trim();

    // 2. Verify Customer belongs to this company
    const customer = await this.db.getCustomerByIdAndCompany(cleanCustomerId, companyId);
    if (!customer) {
      throw new NotFoundError("Cliente non trovato.");
    }

    // 3. Verify Location belongs to this company
    const location = await this.db.getLocationByIdAndCompany(cleanLocationId, companyId);
    if (!location) {
      throw new NotFoundError("Cantiere/Sede non trovato.");
    }

    // 4. Verify Location belongs to the specified Customer
    if (location.customerId !== cleanCustomerId) {
      throw new BadRequestError("La sede specificata non appartiene al cliente indicato.");
    }

    return await this.db.createAsset(companyId, cleanCustomerId, cleanLocationId, {
      assetType: input.assetType,
      name: input.name.trim(),
      manufacturer: input.manufacturer?.trim() || undefined,
      model: input.model?.trim() || undefined,
      serialNumber: input.serialNumber?.trim() || undefined,
      installationDate: input.installationDate?.trim() || undefined,
      warrantyEndDate: input.warrantyEndDate?.trim() || undefined,
      status,
      notes: input.notes?.trim() || undefined,
      isActive: true,
    });
  }

  public async updateAsset(
    companyId: string,
    assetId: string,
    input: UpdateAssetInput
  ): Promise<AssetRecord> {
    validateInputObject(input, "I dati impianto/asset");
    validateOptionalStringField(input.name, "Nome impianto/asset");
    validateOptionalStringField(input.manufacturer, "Produttore", true);
    validateColumnLength(input.manufacturer, "Produttore", 255);
    validateOptionalStringField(input.model, "Modello", true);
    validateColumnLength(input.model, "Modello", 255);
    validateOptionalStringField(input.serialNumber, "Numero di serie", true);
    validateColumnLength(input.serialNumber, "Numero di serie", 255);
    validateOptionalStringField(input.installationDate, "Data di installazione", true);
    validateColumnLength(input.installationDate, "Data di installazione", 50);
    validateOptionalStringField(input.warrantyEndDate, "Data fine garanzia", true);
    validateColumnLength(input.warrantyEndDate, "Data fine garanzia", 50);
    validateOptionalStringField(input.notes, "Note", true);

    const existing = await this.getAssetById(companyId, assetId);

    // Validate name if provided
    validateColumnLength(input.name, "Nome impianto/asset", 255);
    if (input.name !== undefined && input.name !== null) {
      if (typeof input.name !== "string" || input.name.trim().length < 2) {
        throw new BadRequestError("Il nome dell'impianto/asset, se specificato, deve avere almeno 2 caratteri.");
      }
    }

    // Validate assetType if provided
    if (input.assetType !== undefined && !VALID_ASSET_TYPES.includes(input.assetType)) {
      throw new BadRequestError(
        `Tipo impianto non valido. Tipi supportati: ${VALID_ASSET_TYPES.join(", ")}`
      );
    }

    // Validate status if provided
    if (input.status !== undefined && !VALID_ASSET_STATUSES.includes(input.status)) {
      throw new BadRequestError(
        `Stato impianto non valido. Stati supportati: ${VALID_ASSET_STATUSES.join(", ")}`
      );
    }

    if (input.installationDate !== undefined && input.installationDate !== null && typeof input.installationDate === "string" && input.installationDate.trim().length > 0) {
      if (!isValidCalendarDate(input.installationDate.trim())) {
        throw new BadRequestError("Data di installazione non valida. Formato richiesto: YYYY-MM-DD.");
      }
    }

    if (input.warrantyEndDate !== undefined && input.warrantyEndDate !== null && typeof input.warrantyEndDate === "string" && input.warrantyEndDate.trim().length > 0) {
      if (!isValidCalendarDate(input.warrantyEndDate.trim())) {
        throw new BadRequestError("Data fine garanzia non valida. Formato richiesto: YYYY-MM-DD.");
      }
    }

    // Check relationship if customerId or locationId changed
    let targetCustomerId = existing.customerId;
    let targetLocationId = existing.locationId;

    if (input.customerId !== undefined) {
      if (typeof input.customerId !== "string" || input.customerId.trim().length === 0) {
        throw new BadRequestError("Il cliente non può essere vuoto.");
      }
      targetCustomerId = input.customerId.trim();
    }

    if (input.locationId !== undefined) {
      if (typeof input.locationId !== "string" || input.locationId.trim().length === 0) {
        throw new BadRequestError("La sede/cantiere non può essere vuota.");
      }
      targetLocationId = input.locationId.trim();
    }

    if (targetCustomerId !== existing.customerId || targetLocationId !== existing.locationId) {
      const customer = await this.db.getCustomerByIdAndCompany(targetCustomerId, companyId);
      if (!customer) {
        throw new NotFoundError("Cliente non trovato.");
      }
      const location = await this.db.getLocationByIdAndCompany(targetLocationId, companyId);
      if (!location) {
        throw new NotFoundError("Cantiere/Sede non trovato.");
      }
      if (location.customerId !== targetCustomerId) {
        throw new BadRequestError("La sede specificata non appartiene al cliente indicato.");
      }
    }

    const updated = await this.db.updateAsset(companyId, assetId, {
      customerId: targetCustomerId !== existing.customerId ? targetCustomerId : undefined,
      locationId: targetLocationId !== existing.locationId ? targetLocationId : undefined,
      assetType: input.assetType,
      name: input.name !== undefined && input.name !== null ? input.name.trim() : undefined,
      manufacturer: input.manufacturer !== undefined ? (input.manufacturer && typeof input.manufacturer === "string" && input.manufacturer.trim().length > 0 ? input.manufacturer.trim() : (null as any)) : undefined,
      model: input.model !== undefined ? (input.model && typeof input.model === "string" && input.model.trim().length > 0 ? input.model.trim() : (null as any)) : undefined,
      serialNumber: input.serialNumber !== undefined ? (input.serialNumber && typeof input.serialNumber === "string" && input.serialNumber.trim().length > 0 ? input.serialNumber.trim() : (null as any)) : undefined,
      installationDate: input.installationDate !== undefined ? (input.installationDate && typeof input.installationDate === "string" && input.installationDate.trim().length > 0 ? input.installationDate.trim() : (null as any)) : undefined,
      warrantyEndDate: input.warrantyEndDate !== undefined ? (input.warrantyEndDate && typeof input.warrantyEndDate === "string" && input.warrantyEndDate.trim().length > 0 ? input.warrantyEndDate.trim() : (null as any)) : undefined,
      status: input.status,
      notes: input.notes !== undefined ? (input.notes && typeof input.notes === "string" && input.notes.trim().length > 0 ? input.notes.trim() : (null as any)) : undefined,
    });

    if (!updated) {
      throw new NotFoundError("Impianto/Asset non trovato.");
    }
    return updated;
  }

  public async archiveAsset(companyId: string, assetId: string): Promise<AssetRecord> {
    const archived = await this.db.archiveAsset(companyId, assetId);
    if (!archived) {
      throw new NotFoundError("Impianto/Asset non trovato o non accessibile.");
    }
    return archived;
  }

  public async reactivateAsset(companyId: string, assetId: string): Promise<AssetRecord> {
    const reactivated = await this.db.reactivateAsset(companyId, assetId);
    if (!reactivated) {
      throw new NotFoundError("Impianto/Asset non trovato o non accessibile.");
    }
    return reactivated;
  }
}
