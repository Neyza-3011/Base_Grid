import { execFileSync } from "node:child_process";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { CompanyRecord, ReportRecord } from "../types";
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

async function extractPageStreams(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().flatMap((page) => {
    const contents = (page.node as any).Contents();
    if (!contents) return [];
    const streams = Array.isArray(contents.array) ? contents.array : [contents];
    return streams.flatMap((streamRef: any) => {
      const streamObj = doc.context.lookup(streamRef) as any;
      if (!streamObj?.contents) return [];
      let rawBytes: Uint8Array = streamObj.contents;
      const filter = streamObj.dict?.get(doc.context.obj("Filter"));
      if (filter?.toString() === "/FlateDecode") {
        rawBytes = zlib.unzipSync(Buffer.from(rawBytes));
      }
      return [Buffer.from(rawBytes).toString("latin1")];
    });
  });
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
    expect(text).toContain("RAPPORTINO DI INTERVENTO");
    expect(text).toContain("BaseGrid");
    expect(text).toContain("Elettro Rossi (S.r.l.)");
    expect(text).toContain("Mario Rossi");
    expect(text).toContain("Sede/cantiere: Sede Principale");
    expect(text).toContain("Ore di lavoro: 2.5");
    expect(text).toContain("Cavo (3x2.5): 12");
    expect(text).toContain("Firma cliente: non presente");
  });

  it("uses the professional navy and green PDF brand palette", async () => {
    const pdf = await generateReportPdf(sampleReport());
    const streams = (await extractPageStreams(pdf)).join("\n");

    expect(streams).toContain("0.035 0.08 0.16 rg");
    expect(streams).toContain("0.08 0.72 0.58 rg");
    expect(streams).not.toContain("0 0 0 rg");
  });

  it("embeds the saved tenant logo and prints company details when configured", async () => {
    const logoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
    const company: CompanyRecord = {
      id: "company-1",
      name: "Elettro Rossi Srl",
      vatNumber: "IT12345678901",
      address: "Via Roma 10, Roma",
      defaultHourlyRate: 50,
      reportFooterNotes: "Garanzia 24 mesi",
      stripeSubscriptionStatus: "active",
      maxUsers: 5,
      featurePdfExport: true,
      logoDataUrl,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const pdf = await generateReportPdf(sampleReport(), company);
    const parsed = await PDFDocument.load(pdf);
    const text = await extractText(pdf);

    expect(await parsed.getPageCount()).toBe(1);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(text).toContain("Elettro Rossi Srl");
    expect(text).toContain("IT12345678901");
    expect(text).toContain("Garanzia 24 mesi");
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
