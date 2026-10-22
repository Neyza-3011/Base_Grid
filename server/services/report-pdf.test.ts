import { describe, expect, it } from "vitest";
import { ReportRecord } from "../types";
import { generateReportPdf } from "./report-pdf";

function sampleReport(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "report-123",
    companyId: "company-1",
    date: "2026-10-22",
    time: "09:30",
    workHours: 2.5,
    travelHours: 0.5,
    status: "submitted",
    client: { name: "Elettro Rossi (S.r.l.)", address: "Via Roma 10", city: "Roma" },
    technician: { fullName: "Mario Rossi" },
    materialsStatus: "used",
    materialsUsed: [{ name: "Cavo (3x2.5)", quantity: 12 }],
    notes: "Verificato quadro elettrico\\nSostituita una presa",
    signatureBase64: undefined,
    createdAt: "2026-10-22T09:35:00.000Z",
    ...overrides,
  };
}

describe("generateReportPdf", () => {
  it("returns a structurally complete PDF containing report details", () => {
    const pdf = generateReportPdf(sampleReport());
    const text = pdf.toString("ascii");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("/Type /Pages");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("BASEGRID - RAPPORTINO DI INTERVENTO");
    expect(text).toContain("Elettro Rossi \\(S.r.l.\\)");
    expect(text).toContain("Mario Rossi");
    expect(text).toContain("Ore di lavoro: 2.5");
    expect(text).toContain("Cavo \\(3x2.5\\): 12");
    expect(text).toContain("startxref");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("splits long reports into multiple pages and escapes PDF literal delimiters", () => {
    const pdf = generateReportPdf(sampleReport({
      notes: Array.from({ length: 160 }, (_, index) => `Nota ${index + 1} (controllo) \\ eseguito`).join(" "),
    }));
    const text = pdf.toString("ascii");
    const pageCount = (text.match(/\/Type \/Page \/Parent/g) || []).length;

    expect(pageCount).toBeGreaterThan(1);
    expect(text).toContain("Nota 160");
    expect(text).toContain("\\(controllo\\)");
  });

  it("normalizes unsupported Unicode without corrupting the PDF structure", () => {
    const pdf = generateReportPdf(sampleReport({
      client: { name: "Azienda Èlettrica", address: "Via dell’Unità", city: "Forlì" },
    }));
    const text = pdf.toString("ascii");

    expect(text).toContain("Azienda Elettrica");
    expect(text).toContain("Via dell'Unita");
    expect(text).toContain("Forli");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
