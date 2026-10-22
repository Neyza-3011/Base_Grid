export function isNonEmptyString(val: any, maxLength = 255): boolean {
  return typeof val === "string" && val.trim().length > 0 && val.trim().length <= maxLength;
}

export function isValidId(val: any): boolean {
  return isNonEmptyString(val, 100);
}

export function parseFiniteNumber(val: any, fallback = 0): number {
  if (val === undefined || val === null) return fallback;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Validates that a string is a real calendar date in YYYY-MM-DD format.
 * Rejects impossible dates (e.g. 2026-02-29 non-leap, 2026-02-30, 2026-13-01, 2026-00-10).
 */
export function isValidCalendarDate(val: any): boolean {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return false;
  }
  const parts = val.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Validates that a string is a valid time in HH:mm 24-hour format (00:00 - 23:59).
 * Rejects invalid times like 24:00, 99:99, 12:99, -1:00.
 */
export function isValidTime(val: any): boolean {
  if (typeof val !== "string" || !/^([0-9]{2}):([0-9]{2})$/.test(val)) {
    return false;
  }
  const parts = val.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (Number.isNaN(hours) || hours < 0 || hours > 23) return false;
  if (Number.isNaN(minutes) || minutes < 0 || minutes > 59) return false;

  return true;
}

/**
 * Validates signature_base64:
 * - Must be a string
 * - Length must be <= 500,000 (status 413 if exceeded)
 * - Must strictly match data:<allowed-image-mime>;base64,<payload>
 * - Allowed MIMEs: image/png, image/jpeg, image/webp (and image/jpg)
 * - Payload must be non-empty, strictly conform to Base64 syntax (no spaces/arbitrary chars, proper padding)
 * - Decoded binary content must match magic bytes for the declared MIME
 */
export function validateSignatureBase64(signature: any): { valid: boolean; status: number; error: string } {
  if (typeof signature !== "string") {
    return { valid: false, status: 400, error: "La firma deve essere una stringa nel formato Data URL." };
  }

  if (signature.length > 500000) {
    return { valid: false, status: 413, error: "Firma troppo grande (massimo 500KB)." };
  }

  const dataUrlMatch = signature.match(/^data:([^;,]+);base64,(.*)$/);
  if (!dataUrlMatch) {
    return { valid: false, status: 400, error: "Formato firma non valido. Deve essere un Data URL base64 (es. data:image/png;base64,...)." };
  }

  const mime = dataUrlMatch[1].toLowerCase();
  const payload = dataUrlMatch[2];

  const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedMimes.includes(mime)) {
    return { valid: false, status: 400, error: `Tipo MIME '${mime}' non consentito per la firma.` };
  }

  if (payload.length === 0) {
    return { valid: false, status: 400, error: "Payload base64 della firma vuoto." };
  }

  // Strict Base64 regex: multiple of 4, standard alphabet [A-Za-z0-9+/], valid terminal padding (= or ==)
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
  if (!base64Regex.test(payload)) {
    return { valid: false, status: 400, error: "Payload base64 non valido, corrotto o contenente caratteri non ammessi." };
  }

  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0 || buffer.toString("base64") !== payload) {
    return { valid: false, status: 400, error: "Payload base64 non decodificabile o non canonico." };
  }

  // Magic bytes inspection
  if (mime === "image/png") {
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47 ||
      buffer[4] !== 0x0d ||
      buffer[5] !== 0x0a ||
      buffer[6] !== 0x1a ||
      buffer[7] !== 0x0a
    ) {
      return { valid: false, status: 400, error: "Il contenuto binario non corrisponde al formato image/png." };
    }
  } else if (mime === "image/jpeg" || mime === "image/jpg") {
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      return { valid: false, status: 400, error: "Il contenuto binario non corrisponde al formato image/jpeg." };
    }
  } else if (mime === "image/webp") {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
      buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    ) {
      return { valid: false, status: 400, error: "Il contenuto binario non corrisponde al formato image/webp." };
    }
  }

  return { valid: true, status: 200, error: "" };
}
