import { IDatabaseAdapter } from "../db";
import { CompanyRecord, UpdateCompanyInput } from "../types";
import { NotFoundError, ValidationError } from "../errors";
import { PDFDocument } from "pdf-lib";

const MAX_COMPANY_LOGO_BYTES = 256 * 1024;
const MAX_COMPANY_LOGO_DATA_URL_LENGTH = 350_000;

async function validateCompanyLogoDataUrl(value: string): Promise<string> {
  if (value.length > MAX_COMPANY_LOGO_DATA_URL_LENGTH) {
    throw new ValidationError("Il logo deve essere un PNG o JPEG di massimo 256 KB.");
  }
  const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) {
    throw new ValidationError("Il logo deve essere un'immagine PNG o JPEG valida.");
  }
  const mime = match[1].toLowerCase();
  const payload = match[2];
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0 || bytes.length > MAX_COMPANY_LOGO_BYTES || bytes.toString("base64") !== payload) {
    throw new ValidationError("Il logo deve essere un PNG o JPEG di massimo 256 KB.");
  }

  if (mime === "png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
      throw new ValidationError("Il contenuto del logo PNG non è valido.");
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!width || !height || width > 2048 || height > 2048 || width * height > 4_194_304) {
      throw new ValidationError("Le dimensioni del logo non possono superare 2048 × 2048 pixel.");
    }
  } else if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new ValidationError("Il contenuto del logo JPEG non è valido.");
  }

  try {
    const pdf = await PDFDocument.create();
    const image = mime === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    if (!image.width || !image.height || image.width > 2048 || image.height > 2048 || image.width * image.height > 4_194_304) {
      throw new Error("invalid dimensions");
    }
  } catch {
    throw new ValidationError("Il file del logo non è un PNG o JPEG valido o supera le dimensioni consentite.");
  }
  return value;
}

export class CompanyService {
  constructor(private readonly db: IDatabaseAdapter) {}

  async getCompanySettings(companyId: string): Promise<CompanyRecord> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
    }
    const company = await this.db.findCompanyWithLogoById(companyId);
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
      if (typeof input.name !== "string") {
        throw new ValidationError("Company name must be a string");
      }
      const name = input.name.trim();
      if (name.length < 2 || name.length > 100) {
        throw new ValidationError("Company name must be between 2 and 100 characters");
      }
      updates.name = name;
    }

    if (input.vatNumber !== undefined) {
      if (typeof input.vatNumber !== "string") {
        throw new ValidationError("VAT number must be a string");
      }
      const vat = input.vatNumber.trim();
      if (vat.length > 50) {
        throw new ValidationError("VAT number exceeds maximum length of 50 characters");
      }
      updates.vatNumber = vat;
    }

    if (input.address !== undefined) {
      if (typeof input.address !== "string") {
        throw new ValidationError("Address must be a string");
      }
      const addr = input.address.trim();
      if (addr.length > 255) {
        throw new ValidationError("Address exceeds maximum length of 255 characters");
      }
      updates.address = addr;
    }

    if (input.defaultHourlyRate !== undefined) {
      if (typeof input.defaultHourlyRate !== "number") {
        throw new ValidationError("Default hourly rate must be a number");
      }
      const rate = input.defaultHourlyRate;
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
        throw new ValidationError("Default hourly rate must be between 0 and 10,000");
      }
      updates.defaultHourlyRate = rate;
    }

    if (input.logoDataUrl !== undefined) {
      if (input.logoDataUrl === null || input.logoDataUrl === "") {
        updates.logoDataUrl = null;
      } else if (typeof input.logoDataUrl !== "string") {
        throw new ValidationError("Il logo aziendale deve essere una stringa immagine valida.");
      } else {
        updates.logoDataUrl = await validateCompanyLogoDataUrl(input.logoDataUrl);
      }
    }

    if (input.reportFooterNotes !== undefined) {
      if (typeof input.reportFooterNotes !== "string") {
        throw new ValidationError("Footer notes must be a string");
      }
      const notes = input.reportFooterNotes.trim();
      if (notes.length > 1000) {
        throw new ValidationError("Footer notes exceed maximum length of 1,000 characters");
      }
      updates.reportFooterNotes = notes;
    }

    if (input.maxUsers !== undefined && userRole === "superadmin") {
      if (typeof input.maxUsers !== "number") {
        throw new ValidationError("maxUsers must be a number");
      }
      const maxUsers = input.maxUsers;
      if (!Number.isFinite(maxUsers) || maxUsers < 1) {
        throw new ValidationError("maxUsers must be at least 1");
      }
      updates.maxUsers = maxUsers;
    }

    if (input.featurePdfExport !== undefined && userRole === "superadmin") {
      if (typeof input.featurePdfExport !== "boolean") {
        throw new ValidationError("featurePdfExport must be a boolean");
      }
      updates.featurePdfExport = input.featurePdfExport;
    }

    const updated = await this.db.updateCompany(companyId, updates);
    if (!updated) {
      throw new NotFoundError("Company not found or update failed");
    }

    return updated;
  }
}
