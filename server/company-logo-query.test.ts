import { describe, expect, it, vi } from "vitest";
import { PostgresAdapter } from "./db-postgres";

function companyRow(logoDataUrl?: string) {
  return {
    id: "company-logo-query",
    name: "Azienda Test",
    vatNumber: "",
    address: "Via Roma 1",
    defaultHourlyRate: 50,
    reportFooterNotes: "",
    stripeSubscriptionStatus: "active",
    maxUsers: 5,
    featurePdfExport: true,
    isActive: true,
    logoDataUrl,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("company logo query boundaries", () => {
  it("does not load the logo on the normal company lookup path", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [companyRow("data:image/png;base64,large")] });
    const adapter = new PostgresAdapter({ query } as never);

    const company = await adapter.findCompanyById("company-logo-query");

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).not.toContain('"logoDataUrl"');
    expect(company?.logoDataUrl).toBeNull();
  });

  it("loads the logo only through the explicit branding lookup", async () => {
    const logoDataUrl = "data:image/png;base64,small";
    const query = vi.fn().mockResolvedValue({ rows: [companyRow(logoDataUrl)] });
    const adapter = new PostgresAdapter({ query } as never);

    const company = await adapter.findCompanyWithLogoById("company-logo-query");

    expect(query).toHaveBeenCalledWith("SELECT * FROM companies WHERE id = $1 LIMIT 1", [
      "company-logo-query",
    ]);
    expect(company?.logoDataUrl).toBe(logoDataUrl);
  });
});
