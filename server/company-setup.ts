import type { CompanyRecord } from "./types";
import { SUPPORTED_SERVICE_CATEGORIES } from "./company-profile";

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
      company.serviceCategories.length <= SUPPORTED_SERVICE_CATEGORIES.size &&
      company.serviceCategories.every(
        (category) => typeof category === "string" && SUPPORTED_SERVICE_CATEGORIES.has(category),
      ) &&
      new Set(company.serviceCategories).size === company.serviceCategories.length &&
      company.locale === "it-IT" &&
      (company.timeZone === "Europe/Rome" || company.timeZone === "UTC"),
  );
}
