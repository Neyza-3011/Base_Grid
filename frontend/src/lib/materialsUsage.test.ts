import { describe, expect, it } from "vitest";
import type { Report } from "@/lib/api/reports";
import { buildMaterialUsageRows, summarizeMaterials } from "./materialsUsage";

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-1",
    date: "11/11/2026",
    time: "10:00",
    dateTimeFormatted: "11/11/2026 10:00",
    work_hours: 2,
    travel_hours: 0,
    status: "submitted",
    client: { name: "Cliente A" },
    technician: { full_name: "Tecnico A" },
    materials_status: "used",
    materials_used: [{ name: "Cavo FG16", quantity: 2 }],
    created_at: "2026-11-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("materials usage view model", () => {
  it("includes only valid declared material entries and trims names", () => {
    const reports = [
      report({
        materials_used: [
          { name: "  Cavo FG16  ", quantity: 2 },
          { name: "   ", quantity: 1 },
          { name: "Morsetto", quantity: 0 },
          { name: "Guaina", quantity: Number.NaN },
        ],
      }),
      report({ id: "report-none", materials_status: "none", materials_used: [] }),
      report({ id: "report-unverified", materials_status: "unverified", materials_used: [] }),
    ];

    expect(
      buildMaterialUsageRows(reports).map(({ name, quantity }) => ({ name, quantity })),
    ).toEqual([{ name: "Cavo FG16", quantity: 2 }]);
  });

  it("keeps explicit no-material reports distinct from unverified or inconsistent reports", () => {
    const reports = [
      report({ id: "used" }),
      report({ id: "none", materials_status: "none", materials_used: [] }),
      report({ id: "unverified", materials_status: "unverified", materials_used: [] }),
      report({ id: "inconsistent-used", materials_status: "used", materials_used: [] }),
    ];
    const rows = buildMaterialUsageRows(reports);

    expect(summarizeMaterials(reports, rows)).toEqual({
      distinctMaterials: 1,
      totalQuantity: 2,
      reportsWithNoMaterials: 1,
      reportsUnverified: 2,
    });
  });

  it("counts material names case-insensitively as one distinct item", () => {
    const reports = [
      report({ id: "one", materials_used: [{ name: "Cavo", quantity: 2 }] }),
      report({ id: "two", materials_used: [{ name: "cavo", quantity: 3 }] }),
    ];
    const rows = buildMaterialUsageRows(reports);

    expect(summarizeMaterials(reports, rows).distinctMaterials).toBe(1);
    expect(summarizeMaterials(reports, rows).totalQuantity).toBe(5);
  });
});
