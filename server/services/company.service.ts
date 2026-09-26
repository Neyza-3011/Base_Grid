import { IDatabaseAdapter } from "../db";
import { CompanyRecord, UpdateCompanyInput } from "../types";
import { NotFoundError, ValidationError } from "../errors";

export class CompanyService {
  constructor(private readonly db: IDatabaseAdapter) {}

  async getCompanySettings(companyId: string): Promise<CompanyRecord> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
    }
    const company = await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundError("Company not found");
    }
    return company;
  }

  async updateCompanySettings(
    companyId: string,
    input: UpdateCompanyInput,
    userRole: string,
  ): Promise<CompanyRecord> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
    }

    const updates: Partial<CompanyRecord> = {};

    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (name.length < 2 || name.length > 100) {
        throw new ValidationError("Company name must be between 2 and 100 characters");
      }
      updates.name = name;
    }

    if (input.vatNumber !== undefined) {
      const vat = String(input.vatNumber).trim();
      if (vat.length > 50) {
        throw new ValidationError("VAT number exceeds maximum length of 50 characters");
      }
      updates.vatNumber = vat;
    }

    if (input.address !== undefined) {
      const addr = String(input.address).trim();
      if (addr.length > 255) {
        throw new ValidationError("Address exceeds maximum length of 255 characters");
      }
      updates.address = addr;
    }

    if (input.defaultHourlyRate !== undefined) {
      const rate = Number(input.defaultHourlyRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
        throw new ValidationError("Default hourly rate must be between 0 and 10,000");
      }
      updates.defaultHourlyRate = rate;
    }

    if (input.reportFooterNotes !== undefined) {
      const notes = String(input.reportFooterNotes).trim();
      if (notes.length > 1000) {
        throw new ValidationError("Footer notes exceed maximum length of 1,000 characters");
      }
      updates.reportFooterNotes = notes;
    }

    if (input.maxUsers !== undefined && userRole === "superadmin") {
      const maxUsers = Number(input.maxUsers);
      if (!Number.isFinite(maxUsers) || maxUsers < 1) {
        throw new ValidationError("maxUsers must be at least 1");
      }
      updates.maxUsers = maxUsers;
    }

    if (input.featurePdfExport !== undefined && userRole === "superadmin") {
      updates.featurePdfExport = Boolean(input.featurePdfExport);
    }

    const updated = await this.db.updateCompany(companyId, updates);
    if (!updated) {
      throw new NotFoundError("Company not found or update failed");
    }

    return updated;
  }
}
