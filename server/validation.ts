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
