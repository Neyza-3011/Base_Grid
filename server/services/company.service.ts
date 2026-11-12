import { IDatabaseAdapter } from "../db";
import { CompanyRecord, CreateAdminAuditEventInput, UpdateCompanyInput } from "../types";
import { NotFoundError, ValidationError } from "../errors";
import { PDFDocument } from "pdf-lib";
import { hasSafeImageDimensions } from "../validation";
import { SUPPORTED_LOCALES, SUPPORTED_SERVICE_CATEGORIES, SUPPORTED_TIME_ZONES } from "../company-profile";

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
  } else if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new ValidationError("Il contenuto del logo JPEG non è valido.");
  }
  if (!hasSafeImageDimensions(bytes, mime === "png" ? "image/png" : "image/jpeg")) {
    throw new ValidationError("Le dimensioni del logo non possono superare 2048 × 2048 pixel e devono essere valide.");
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

  async getCompanySettings(companyId: string, includeLogo = true): Promise<CompanyRecord> {
    if (!companyId) {
      throw new ValidationError("Company ID is required");
    }
    const company = includeLogo
      ? await this.db.findCompanyWithLogoById(companyId)
      : await this.db.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundError("Company not found");
    }
    return company;
  }

  async updateCompanySettings(
    companyId: string,
    input: UpdateCompanyInput,
    userRole: string,
    audit?: CreateAdminAuditEventInput,
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
      if (addr.length === 0) {
        throw new ValidationError("L'indirizzo aziendale è obbligatorio per completare la configurazione.");
      }
      if (addr.length > 255) {
        throw new ValidationError("Address exceeds maximum length of 255 characters");
      }
      updates.address = addr;
    }

    if (input.contactEmail !== undefined) {
      if (typeof input.contactEmail !== "string") {
        throw new ValidationError("L'email aziendale deve essere una stringa.");
      }
      const email = input.contactEmail.trim().toLowerCase();
      if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError("Inserisci un indirizzo email aziendale valido.");
      }
      updates.contactEmail = email;
    }

    if (input.contactPhone !== undefined) {
      if (typeof input.contactPhone !== "string") {
        throw new ValidationError("Il telefono aziendale deve essere una stringa.");
      }
      const phone = input.contactPhone.trim();
      const digitCount = phone.replace(/\D/g, "").length;
      if (
        phone.length < 7 ||
        phone.length > 40 ||
        digitCount < 7 ||
        digitCount > 15 ||
        !/^[+0-9().\s/-]+$/.test(phone)
      ) {
        throw new ValidationError("Inserisci un numero di telefono valido con 7–15 cifre.");
      }
      updates.contactPhone = phone;
    }

    if (input.serviceArea !== undefined) {
      if (typeof input.serviceArea !== "string") {
        throw new ValidationError("L'area di servizio deve essere una stringa.");
      }
      const serviceArea = input.serviceArea.trim();
      if (serviceArea.length < 2 || serviceArea.length > 255) {
        throw new ValidationError("L'area di servizio deve contenere 2–255 caratteri.");
      }
      updates.serviceArea = serviceArea;
    }

    if (input.serviceCategories !== undefined) {
      if (
        !Array.isArray(input.serviceCategories) ||
        input.serviceCategories.length < 1 ||
        input.serviceCategories.length > SUPPORTED_SERVICE_CATEGORIES.size ||
        input.serviceCategories.some(
          (category) => typeof category !== "string" || !SUPPORTED_SERVICE_CATEGORIES.has(category),
        ) ||
        new Set(input.serviceCategories).size !== input.serviceCategories.length
      ) {
        throw new ValidationError("Seleziona almeno una categoria di servizio valida.");
      }
      updates.serviceCategories = [...input.serviceCategories];
    }

    if (input.locale !== undefined) {
      if (typeof input.locale !== "string" || !SUPPORTED_LOCALES.has(input.locale)) {
        throw new ValidationError("La lingua selezionata non è supportata.");
      }
      updates.locale = input.locale;
    }

    if (input.timeZone !== undefined) {
      if (typeof input.timeZone !== "string" || !SUPPORTED_TIME_ZONES.has(input.timeZone)) {
        throw new ValidationError("Il fuso orario selezionato non è supportato.");
      }
      updates.timeZone = input.timeZone;
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
      // PostgreSQL stores maxUsers in a signed 32-bit INTEGER column.
      if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 2_147_483_647) {
        throw new ValidationError("maxUsers must be a positive integer within the database range");
      }
      updates.maxUsers = maxUsers;
    }

    if (input.featurePdfExport !== undefined && userRole === "superadmin") {
      if (typeof input.featurePdfExport !== "boolean") {
        throw new ValidationError("featurePdfExport must be a boolean");
      }
      updates.featurePdfExport = input.featurePdfExport;
    }

    const updated = audit
      ? await this.db.updateCompanyWithAudit(companyId, updates, audit)
      : await this.db.updateCompany(companyId, updates);
    if (!updated) {
      throw new NotFoundError("Company not found or update failed");
    }

    return updated;
  }
}
