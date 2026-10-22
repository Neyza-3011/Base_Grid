import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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
    locationName: "Sede Principale",
    technician: { fullName: "Mario Rossi" },
    materialsStatus: "used",
    materialsUsed: [{ name: "Cavo (3x2.5)", quantity: 12 }],
    notes: "Verificato quadro elettrico\\nSostituita una presa",
    signatureBase64: undefined,
    createdAt: "2026-10-22T09:35:00.000Z",
    ...overrides,
  };
}

function extractText(pdf: Buffer): string {
  return execFileSync("pdftotext", ["-", "-"], { input: pdf, encoding: "utf8" });
}

describe("generateReportPdf", () => {
  it("returns a valid PDF containing report details", async () => {
    const pdf = await generateReportPdf(sampleReport());
    const parsed = await PDFDocument.load(pdf);
    const text = extractText(pdf);

    expect(pdf.toString("ascii", 0, 8)).toBe("%PDF-1.7");
    expect(await parsed.getPageCount()).toBe(1);
    expect(text).toContain("BASEGRID - RAPPORTINO DI INTERVENTO");
    expect(text).toContain("Elettro Rossi (S.r.l.)");
    expect(text).toContain("Mario Rossi");
    expect(text).toContain("Sede/cantiere: Sede Principale");
    expect(text).toContain("Ore di lavoro: 2.5");
    expect(text).toContain("Cavo (3x2.5): 12");
    expect(text).toContain("Firma cliente: non presente");
  });

  it("embeds a valid PNG signature as a PDF image", async () => {
    const signatureBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
    const pdf = await generateReportPdf(sampleReport({ signatureBase64 }));
    const parsed = await PDFDocument.load(pdf);
    const text = extractText(pdf);

    expect(await parsed.getPageCount()).toBe(1);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(text).toContain("Firma cliente: immagine inclusa sotto");
    expect(text).not.toContain("immagine inclusa sotto");
  });

  it("splits long reports into multiple pages", async () => {
    const pdf = await generateReportPdf(sampleReport({
      notes: Array.from({ length: 160 }, (_, index) => `Nota ${index + 1} (controllo) \\ eseguito`).join(" "),
    }));
    const parsed = await PDFDocument.load(pdf);
    const text = extractText(pdf);

    expect(await parsed.getPageCount()).toBeGreaterThan(1);
    expect(text).toContain("Nota 160");
  });

  it("rejects malformed signature data rather than silently omitting the image", async () => {
    await expect(generateReportPdf(sampleReport({
      signatureBase64: "data:image/png;base64,not-an-image",
    }))).rejects.toThrow("Firma cliente non valida");
  });
});
