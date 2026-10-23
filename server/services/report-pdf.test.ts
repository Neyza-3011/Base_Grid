import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
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
    notes: "Verificato quadro elettrico\nSostituita una presa",
    signatureBase64: undefined,
    createdAt: "2026-10-22T09:35:00.000Z",
    ...overrides,
  };
}

async function extractText(pdf: Buffer): Promise<string> {
  try {
    return execFileSync("pdftotext", ["-", "-"], { input: pdf, encoding: "utf8" });
  } catch {
    const doc = await PDFDocument.load(pdf);
    let fullText = "";
    for (const page of doc.getPages()) {
      const contents = (page.node as any).Contents();
      if (!contents) continue;
      const streams = Array.isArray(contents.array) ? contents.array : [contents];
      for (const streamRef of streams) {
        const streamObj = doc.context.lookup(streamRef) as any;
        if (streamObj && streamObj.contents) {
          let rawBytes: Uint8Array = streamObj.contents;
          const filter = streamObj.dict?.get(doc.context.obj("Filter"));
          if (filter?.toString() === "/FlateDecode") {
            rawBytes = zlib.unzipSync(Buffer.from(rawBytes));
          }
          const streamStr = Buffer.from(rawBytes).toString("latin1");
          const hexMatches = streamStr.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g);
          for (const m of hexMatches) {
            fullText += Buffer.from(m[1], "hex").toString("utf8") + "\n";
          }
          const strMatches = streamStr.matchAll(/\((.*?)\)\s*Tj/g);
          for (const m of strMatches) {
            fullText += m[1] + "\n";
          }
        }
      }
    }
    return fullText;
  }
}

describe("generateReportPdf", () => {
  it("returns a valid PDF containing report details", async () => {
    const pdf = await generateReportPdf(sampleReport());
    const parsed = await PDFDocument.load(pdf);
    const text = await extractText(pdf);

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
    const signatureBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
    const pdf = await generateReportPdf(sampleReport({ signatureBase64 }));
    const parsed = await PDFDocument.load(pdf);
    const text = await extractText(pdf);

    expect(await parsed.getPageCount()).toBe(1);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(text).toContain("Firma cliente: immagine inclusa sotto");
  });

  it("splits long reports into multiple pages", async () => {
    const pdf = await generateReportPdf(sampleReport({
      notes: Array.from({ length: 160 }, (_, index) => `Nota ${index + 1} (controllo) \\ eseguito`).join(" "),
    }));
    const parsed = await PDFDocument.load(pdf);
    const text = await extractText(pdf);

    expect(await parsed.getPageCount()).toBeGreaterThan(1);
    expect(text).toContain("Nota 160");
  });

  it("rejects JPEG data with matching magic bytes but an invalid image body", async () => {
    await expect(generateReportPdf(sampleReport({
      signatureBase64: "data:image/jpeg;base64,/9j/AA==",
    }))).rejects.toThrow();
  });

  it("rejects malformed signature data rather than silently omitting the image", async () => {
    await expect(generateReportPdf(sampleReport({
      signatureBase64: "data:image/png;base64,not-an-image",
    }))).rejects.toThrow("Firma cliente non valida");
  });
});
