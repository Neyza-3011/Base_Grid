import { IDatabaseAdapter } from "../db";
import { CreateCustomerInput, CreateLocationInput, CustomerRecord, LocationRecord, UpdateCustomerInput, UpdateLocationInput } from "../types";
import { BadRequestError, NotFoundError } from "../errors";

function validateInputObject(input: unknown, entityName = "I dati"): void {
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

export class CustomerService {
  constructor(private db: IDatabaseAdapter) {}

  public async getCustomers(companyId: string, search?: string, activeOnly?: boolean, limit?: number): Promise<CustomerRecord[]> {
    return await this.db.getCustomersByCompany(companyId, search, activeOnly, limit);
  }

  public async getCustomerById(companyId: string, customerId: string): Promise<CustomerRecord> {
    const customer = await this.db.getCustomerByIdAndCompany(customerId, companyId);
    if (!customer) {
      throw new NotFoundError("Cliente non trovato.");
    }
    return customer;
  }

  public async createCustomer(companyId: string, input: CreateCustomerInput): Promise<CustomerRecord> {
    validateInputObject(input, "I dati cliente");
    validateOptionalStringField(input.legalName, "Ragione sociale", true);
    validateColumnLength(input.legalName, "Ragione sociale", 255);
    validateOptionalStringField(input.vatNumber, "Partita IVA", true);
    validateColumnLength(input.vatNumber, "Partita IVA", 255);
    validateOptionalStringField(input.taxCode, "Codice fiscale", true);
    validateColumnLength(input.taxCode, "Codice fiscale", 255);
    validateOptionalStringField(input.pec, "PEC", true);
    validateColumnLength(input.pec, "PEC", 255);
    validateOptionalStringField(input.phoneNumber, "Telefono", true);
    validateColumnLength(input.phoneNumber, "Telefono", 255);
    validateOptionalStringField(input.email, "Email", true);
    validateColumnLength(input.email, "Email", 255);
    validateOptionalStringField(input.notes, "Note", true);

    validateColumnLength(input.displayName, "Nome cliente", 255);
    if (!input.displayName || typeof input.displayName !== "string" || input.displayName.trim().length < 2) {
      throw new BadRequestError("Il nome del cliente è obbligatorio e deve avere almeno 2 caratteri.");
    }

    return await this.db.createCustomer(companyId, {
      ...input,
      displayName: input.displayName.trim(),
    });
  }

  public async updateCustomer(companyId: string, customerId: string, input: UpdateCustomerInput): Promise<CustomerRecord> {
    validateInputObject(input, "I dati cliente");
    validateOptionalStringField(input.displayName, "Nome cliente", true);
    validateOptionalStringField(input.legalName, "Ragione sociale", true);
    validateColumnLength(input.legalName, "Ragione sociale", 255);
    validateOptionalStringField(input.vatNumber, "Partita IVA", true);
    validateColumnLength(input.vatNumber, "Partita IVA", 255);
    validateOptionalStringField(input.taxCode, "Codice fiscale", true);
    validateColumnLength(input.taxCode, "Codice fiscale", 255);
    validateOptionalStringField(input.pec, "PEC", true);
    validateColumnLength(input.pec, "PEC", 255);
    validateOptionalStringField(input.phoneNumber, "Telefono", true);
    validateColumnLength(input.phoneNumber, "Telefono", 255);
    validateOptionalStringField(input.email, "Email", true);
    validateColumnLength(input.email, "Email", 255);
    validateOptionalStringField(input.notes, "Note", true);

    validateColumnLength(input.displayName, "Nome cliente", 255);
    if (input.displayName !== undefined && input.displayName !== null) {
      if (typeof input.displayName !== "string" || input.displayName.trim().length < 2) {
        throw new BadRequestError("Il nome del cliente, se specificato, deve avere almeno 2 caratteri.");
      }
    }

    const updated = await this.db.updateCustomer(companyId, customerId, {
      ...input,
      displayName: input.displayName ? input.displayName.trim() : undefined,
      legalName: input.legalName !== undefined ? (input.legalName && typeof input.legalName === "string" && input.legalName.trim().length > 0 ? input.legalName.trim() : (null as any)) : undefined,
      vatNumber: input.vatNumber !== undefined ? (input.vatNumber && typeof input.vatNumber === "string" && input.vatNumber.trim().length > 0 ? input.vatNumber.trim() : (null as any)) : undefined,
      taxCode: input.taxCode !== undefined ? (input.taxCode && typeof input.taxCode === "string" && input.taxCode.trim().length > 0 ? input.taxCode.trim() : (null as any)) : undefined,
      email: input.email !== undefined ? (input.email && typeof input.email === "string" && input.email.trim().length > 0 ? input.email.trim() : (null as any)) : undefined,
      phoneNumber: input.phoneNumber !== undefined ? (input.phoneNumber && typeof input.phoneNumber === "string" && input.phoneNumber.trim().length > 0 ? input.phoneNumber.trim() : (null as any)) : undefined,
      pec: input.pec !== undefined ? (input.pec && typeof input.pec === "string" && input.pec.trim().length > 0 ? input.pec.trim() : (null as any)) : undefined,
      notes: input.notes !== undefined ? (input.notes && typeof input.notes === "string" && input.notes.trim().length > 0 ? input.notes.trim() : (null as any)) : undefined,
    });

    if (!updated) {
      throw new NotFoundError("Cliente non trovato.");
    }
    return updated;
  }

  public async getLocations(companyId: string, customerId: string, search?: string, activeOnly?: boolean, limit?: number): Promise<LocationRecord[]> {
    // Ensure customer exists
    await this.getCustomerById(companyId, customerId);
    
    return await this.db.getLocationsByCustomerAndCompany(customerId, companyId, search, activeOnly, limit);
  }

  public async getLocationById(companyId: string, locationId: string): Promise<LocationRecord> {
    const location = await this.db.getLocationByIdAndCompany(locationId, companyId);
    if (!location) {
      throw new NotFoundError("Cantiere/Sede non trovato.");
    }
    return location;
  }

  public async createLocation(companyId: string, customerId: string, input: CreateLocationInput): Promise<LocationRecord> {
    validateInputObject(input, "I dati sede");
    validateOptionalStringField(input.postalCode, "CAP", true);
    validateColumnLength(input.name, "Nome sede", 255);
    validateColumnLength(input.address, "Indirizzo", 500);
    validateColumnLength(input.city, "Città", 255);
    validateColumnLength(input.province, "Provincia", 255);
    validateColumnLength(input.postalCode, "CAP", 50);
    validateOptionalStringField(input.province, "Provincia", true);
    validateOptionalStringField(input.notes, "Note", true);

    // Ensure customer exists
    await this.getCustomerById(companyId, customerId);

    if (!input.name || typeof input.name !== "string" || input.name.trim().length < 1) {
      throw new BadRequestError("Il nome della sede è obbligatorio.");
    }
    if (!input.address || typeof input.address !== "string" || input.address.trim().length < 1) {
      throw new BadRequestError("L'indirizzo è obbligatorio.");
    }
    if (!input.city || typeof input.city !== "string" || input.city.trim().length < 1) {
      throw new BadRequestError("La città è obbligatoria.");
    }

    return await this.db.createLocation(companyId, customerId, {
      ...input,
      name: input.name.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
    });
  }

  public async updateLocation(companyId: string, locationId: string, input: UpdateLocationInput): Promise<LocationRecord> {
    validateInputObject(input, "I dati sede");
    validateOptionalStringField(input.name, "Nome sede");
    validateOptionalStringField(input.address, "Indirizzo");
    validateOptionalStringField(input.city, "Città");
    validateOptionalStringField(input.province, "Provincia", true);
    validateOptionalStringField(input.postalCode, "CAP", true);
    validateOptionalStringField(input.notes, "Note", true);
    validateColumnLength(input.name, "Nome sede", 255);
    validateColumnLength(input.address, "Indirizzo", 500);
    validateColumnLength(input.city, "Città", 255);
    validateColumnLength(input.province, "Provincia", 255);
    validateColumnLength(input.postalCode, "CAP", 50);

    for (const [value, fieldName] of [
      [input.name, "Nome sede"],
      [input.address, "Indirizzo"],
      [input.city, "Città"],
    ] as const) {
      if (value !== undefined && (typeof value !== "string" || value.trim().length < 1)) {
        throw new BadRequestError(`${fieldName}, se specificato, non può essere vuoto.`);
      }
    }

    const updated = await this.db.updateLocation(companyId, locationId, {
      ...input,
      name: input.name ? input.name.trim() : undefined,
      address: input.address ? input.address.trim() : undefined,
      city: input.city ? input.city.trim() : undefined,
      province: input.province !== undefined ? (input.province && typeof input.province === "string" && input.province.trim().length > 0 ? input.province.trim() : (null as any)) : undefined,
      postalCode: input.postalCode !== undefined ? (input.postalCode && typeof input.postalCode === "string" && input.postalCode.trim().length > 0 ? input.postalCode.trim() : (null as any)) : undefined,
      notes: input.notes !== undefined ? (input.notes && typeof input.notes === "string" && input.notes.trim().length > 0 ? input.notes.trim() : (null as any)) : undefined,
    });

    if (!updated) {
      throw new NotFoundError("Cantiere/Sede non trovato.");
    }
    return updated;
  }

  public async archiveCustomer(companyId: string, customerId: string): Promise<CustomerRecord> {
    const archived = await this.db.archiveCustomer(companyId, customerId);
    if (!archived) {
      throw new NotFoundError("Cliente non trovato o non accessibile.");
    }
    return archived;
  }

  public async reactivateCustomer(companyId: string, customerId: string): Promise<CustomerRecord> {
    const reactivated = await this.db.reactivateCustomer(companyId, customerId);
    if (!reactivated) {
      throw new NotFoundError("Cliente non trovato o non accessibile.");
    }
    return reactivated;
  }

  public async archiveLocation(companyId: string, locationId: string): Promise<LocationRecord> {
    const archived = await this.db.archiveLocation(companyId, locationId);
    if (!archived) {
      throw new NotFoundError("Cantiere/Sede non trovato o non accessibile.");
    }
    return archived;
  }

  public async reactivateLocation(companyId: string, locationId: string): Promise<LocationRecord> {
    const reactivated = await this.db.reactivateLocation(companyId, locationId);
    if (!reactivated) {
      throw new NotFoundError("Cantiere/Sede non trovato o non accessibile.");
    }
    return reactivated;
  }
}
