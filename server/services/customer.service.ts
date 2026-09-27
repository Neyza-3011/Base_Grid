import { IDatabaseAdapter } from "../db";
import { CreateCustomerInput, CreateLocationInput, CustomerRecord, LocationRecord, UpdateCustomerInput, UpdateLocationInput } from "../types";
import { BadRequestError, NotFoundError } from "../errors";

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
    if (!input.displayName || input.displayName.trim().length < 2) {
      throw new BadRequestError("Il nome del cliente è obbligatorio e deve avere almeno 2 caratteri.");
    }

    return await this.db.createCustomer(companyId, {
      ...input,
      displayName: input.displayName.trim(),
    });
  }

  public async updateCustomer(companyId: string, customerId: string, input: UpdateCustomerInput): Promise<CustomerRecord> {
    if (input.displayName !== undefined && input.displayName.trim().length < 2) {
      throw new BadRequestError("Il nome del cliente, se specificato, deve avere almeno 2 caratteri.");
    }

    const updated = await this.db.updateCustomer(companyId, customerId, {
      ...input,
      displayName: input.displayName ? input.displayName.trim() : undefined,
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
    // Ensure customer exists
    await this.getCustomerById(companyId, customerId);

    if (!input.name || input.name.trim().length < 1) {
      throw new BadRequestError("Il nome della sede è obbligatorio.");
    }
    if (!input.address || input.address.trim().length < 1) {
      throw new BadRequestError("L'indirizzo è obbligatorio.");
    }
    if (!input.city || input.city.trim().length < 1) {
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
    if (input.name !== undefined && input.name.trim().length < 1) {
      throw new BadRequestError("Il nome della sede, se specificato, non può essere vuoto.");
    }

    const updated = await this.db.updateLocation(companyId, locationId, {
      ...input,
      name: input.name ? input.name.trim() : undefined,
      address: input.address ? input.address.trim() : undefined,
      city: input.city ? input.city.trim() : undefined,
    });

    if (!updated) {
      throw new NotFoundError("Cantiere/Sede non trovato.");
    }
    return updated;
  }
}
