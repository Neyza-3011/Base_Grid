import type { CompanyRecord } from "./types";

/** Single server-side definition of whether a tenant has completed required onboarding. */
export function isCompanySetupComplete(
  company: Pick<
    CompanyRecord,
    | "name"
    | "address"
    | "contactEmail"
    | "contactPhone"
    | "serviceArea"
    | "serviceCategories"
    | "locale"
    | "timeZone"
  >,
): boolean {
  return Boolean(
    company.name?.trim() &&
      company.address?.trim() &&
      company.contactEmail?.trim() &&
      company.contactPhone?.trim() &&
      company.serviceArea?.trim() &&
      Array.isArray(company.serviceCategories) &&
      company.serviceCategories.length > 0 &&
      company.locale === "it-IT" &&
      (company.timeZone === "Europe/Rome" || company.timeZone === "UTC"),
  );
}
