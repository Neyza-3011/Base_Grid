import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReportRecord } from "../types";
import { generateReportPdf } from "./report-pdf";

const hasPoppler = (() => {
  try {
    execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function makeReport(): ReportRecord {
  return {
    id: "pdf-parser-check",
    companyId: "company-test",
    date: "2026-10-22",
    time: "09:30",
    workHours: 2,
    travelHours: 0.5,
    status: "submitted",
    client: { name: "Cliente di test", address: "Via Roma 1", city: "Roma" },
    locationName: "Cantiere indipendente",
    technician: { fullName: "Tecnico di test" },
    materialsStatus: "none",
    materialsUsed: [],
    notes: "Controllo PDF con parser indipendente.",
    createdAt: "2026-10-22T09:35:00.000Z",
  };
}

describe("generated PDF independent parser validation", () => {
  it.skipIf(!hasPoppler)("opens the PDF and extracts expected report text with Poppler", () => {
    const directory = mkdtempSync(join(tmpdir(), "basegrid-pdf-"));
    const pdfPath = join(directory, "report.pdf");

    try {
      writeFileSync(pdfPath, generateReportPdf(makeReport()));

      const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      expect(info).toMatch(/Pages:\s+1/);
      expect(info).toMatch(/PDF version:\s+1\.4/);

      const extractedText = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
      expect(extractedText).toContain("BASEGRID - RAPPORTINO DI INTERVENTO");
      expect(extractedText).toContain("Cantiere indipendente");
      expect(extractedText).toContain("Tecnico di test");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
