import { describe, expect, it } from "vitest";
import { isCompanySetupComplete } from "./company-setup";

const completeProfile = {
  name: "Impianti Rossi Srl",
  address: "Via Demo 10, Roma",
  contactEmail: "ufficio@example.test",
  contactPhone: "+39 06 1234567",
  serviceArea: "Roma e provincia",
  serviceCategories: ["installazione", "manutenzione"],
  locale: "it-IT",
  timeZone: "Europe/Rome",
};

describe("isCompanySetupComplete", () => {
  it("accepts a fully populated supported company profile", () => {
    expect(isCompanySetupComplete(completeProfile)).toBe(true);
  });

  it.each([
    ["company name", { name: "   " }],
    ["company address", { address: "" }],
    ["contact email", { contactEmail: "" }],
    ["contact phone", { contactPhone: "" }],
    ["service area", { serviceArea: " " }],
    ["service categories", { serviceCategories: [] }],
    ["locale", { locale: "en-US" }],
    ["time zone", { timeZone: "Mars/Olympus" }],
  ])("rejects an incomplete or unsupported %s", (_field, override) => {
    expect(isCompanySetupComplete({ ...completeProfile, ...override })).toBe(false);
  });

  it.each([
    ["unsupported category", ["unsupported-service"]],
    ["duplicate categories", ["installazione", "installazione"]],
    ["non-string category", ["installazione", 7] as unknown as string[]],
  ])("rejects invalid service categories (%s)", (_description, serviceCategories) => {
    expect(isCompanySetupComplete({ ...completeProfile, serviceCategories })).toBe(false);
  });

  it("accepts UTC as the explicitly supported alternative time zone", () => {
    expect(isCompanySetupComplete({ ...completeProfile, timeZone: "UTC" })).toBe(true);
  });
});
