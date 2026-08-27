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
