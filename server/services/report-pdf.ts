import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { CompanyRecord, ReportRecord } from "../types";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const TOP = 790;
const BOTTOM = 52;
const SIGNATURE_RESERVED_HEIGHT = 105;
const LINE_HEIGHT = 17;
const MAX_CHARS = 88;
const BRAND_NAVY = rgb(0.035, 0.08, 0.16);
const BRAND_GREEN = rgb(0.08, 0.72, 0.58);
const INK = rgb(0.12, 0.17, 0.25);
const MUTED = rgb(0.36, 0.41, 0.49);
const PALE = rgb(0.91, 0.95, 0.97);
const WHITE = rgb(1, 1, 1);

function safeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\u00A0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF€]/g, "?");
}

function wrapLine(value: string, maxChars = MAX_CHARS): string[] {
  const paragraphs = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  return paragraphs.flatMap((paragraph) => {
    const normalized = safeText(paragraph).trim();
    if (!normalized) return [""];
    const words = normalized.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (current) lines.push(current);
        current = "";
        for (let offset = 0; offset < word.length; offset += maxChars) {
          const chunk = word.slice(offset, offset + maxChars);
          if (chunk.length === maxChars) lines.push(chunk);
          else current = chunk;
        }
        continue;
      }
      const next = current ? current + " " + word : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  });
}

function formatMaterials(report: ReportRecord): string[] {
  const materials = Array.isArray(report.materialsUsed) ? report.materialsUsed : [];
  if (report.materialsStatus === "none") return ["Materiali: nessuno dichiarato"];
  if (report.materialsStatus === "used" && materials.length) {
    return ["Materiali utilizzati:", ...materials.map((item) => `- ${item.name}: ${item.quantity}`)];
  }
  return ["Materiali: non verificati"];
}

function reportLines(report: ReportRecord, company?: CompanyRecord | null): string[] {
  const client = report.client || { name: "", address: "", city: "" };
  const technician = report.technician || { fullName: "" };
  const lines = [
    `Rapportino ID: ${report.id}`,
    `Data: ${report.date || "-"}    Ora: ${report.time || "-"}`,
    `Stato: ${report.status || "-"}`,
    "",
    "CLIENTE",
    `Nome: ${client.name || "-"}`,
    `Indirizzo: ${client.address || "-"}`,
    `Citta: ${client.city || "-"}`,
    `Sede/cantiere: ${report.locationName || "-"}`,
    "",
    "TECNICO E DURATA",
    `Tecnico: ${technician.fullName || "-"}`,
    `Ore di lavoro: ${report.workHours ?? 0}`,
    `Ore di viaggio: ${report.travelHours ?? 0}`,
    "",
    "MATERIALI",
    ...formatMaterials(report),
    "",
    "NOTE",
    ...(report.notes ? wrapLine(report.notes) : ["Nessuna nota inserita"]),
    "",
    `Firma cliente: ${report.signatureBase64 ? "immagine inclusa sotto" : "non presente"}`,
    `Creato il: ${report.createdAt || "-"}`,
  ];
  if (company?.reportFooterNotes?.trim()) {
    lines.push("", "NOTE AZIENDALI", ...wrapLine(company.reportFooterNotes));
  }
  lines.push("", "Documento generato automaticamente da BaseGrid.");
  return lines.flatMap((line) => wrapLine(line));
}

function decodeSignature(signature: string): { mime: string; bytes: Buffer } {
  const match = signature.match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Firma cliente non valida per l'esportazione PDF.");
  const mime = match[1].toLowerCase();
  const payload = match[2];
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== payload) {
    throw new Error("Firma cliente non valida per l'esportazione PDF.");
  }
  if (mime === "image/png") {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature)) {
      throw new Error("Firma cliente non valida per l'esportazione PDF.");
    }
  } else if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("Firma cliente non valida per l'esportazione PDF.");
  }
  return { mime, bytes };
}

function decodeCompanyLogo(dataUrl: string): { mime: "png" | "jpeg"; bytes: Buffer } {
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Il logo aziendale salvato non è un PNG o JPEG valido.");
  const payload = match[2];
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== payload || bytes.length > 256 * 1024) {
    throw new Error("Il logo aziendale salvato non è valido.");
  }
  return { mime: match[1].toLowerCase() as "png" | "jpeg", bytes };
}

function drawFirstPageHeader(
  page: PDFPage,
  report: ReportRecord,
  company: CompanyRecord | null | undefined,
  logo: PDFImage | undefined,
  regularFont: any,
  boldFont: any,
): void {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 132, width: PAGE_WIDTH, height: 132, color: BRAND_NAVY });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 132, width: PAGE_WIDTH, height: 5, color: BRAND_GREEN });

  let titleX = LEFT;
  if (logo) {
    const maxWidth = 62;
    const maxHeight = 62;
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: LEFT,
      y: PAGE_HEIGHT - 92 - height / 2,
      width,
      height,
    });
    titleX = LEFT + 78;
  }

  page.drawText(safeText(company?.name || "BaseGrid"), {
    x: titleX,
    y: TOP + 18,
    size: 14,
    font: boldFont,
    color: WHITE,
    maxWidth: PAGE_WIDTH - titleX - LEFT,
  });
  page.drawText("RAPPORTINO DI INTERVENTO", {
    x: titleX,
    y: TOP - 7,
    size: 10,
    font: boldFont,
    color: BRAND_GREEN,
  });
  page.drawText(`Documento ${safeText(report.id)}  |  ${safeText(report.date || "-")}`, {
    x: titleX,
    y: TOP - 27,
    size: 8,
    font: regularFont,
    color: rgb(0.83, 0.88, 0.92),
    maxWidth: PAGE_WIDTH - titleX - LEFT,
  });
  const companyMeta = [company?.address, company?.vatNumber ? `P.IVA ${company.vatNumber}` : ""]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => safeText(value))
    .join("  |  ");
  if (companyMeta) {
    page.drawText(companyMeta, {
      x: titleX,
      y: TOP - 45,
      size: 7.5,
      font: regularFont,
      color: rgb(0.78, 0.83, 0.88),
      maxWidth: PAGE_WIDTH - titleX - LEFT,
    });
  }
}

function drawPageFooter(page: PDFPage, pageIndex: number, pageCount: number, regularFont: any): void {
  page.drawLine({
    start: { x: LEFT, y: 34 },
    end: { x: PAGE_WIDTH - LEFT, y: 34 },
    thickness: 0.6,
    color: PALE,
  });
  page.drawText("BaseGrid  |  Rapportino di intervento", {
    x: LEFT,
    y: 20,
    size: 7,
    font: regularFont,
    color: MUTED,
  });
  page.drawText(`Pagina ${pageIndex + 1} di ${pageCount}`, {
    x: PAGE_WIDTH - LEFT - 76,
    y: 20,
    size: 7,
    font: regularFont,
    color: MUTED,
  });
}

function isSectionHeading(line: string): boolean {
  return ["CLIENTE", "TECNICO E DURATA", "MATERIALI", "NOTE", "NOTE AZIENDALI"].includes(line);
}

/**
 * Generates a paginated, branded intervention PDF. Company logos are optional and
 * are read only from the authenticated tenant's persisted company settings.
 */
export async function generateReportPdf(
  report: ReportRecord,
  company?: CompanyRecord | null,
): Promise<Buffer> {
  const signatureData = report.signatureBase64 ? decodeSignature(report.signatureBase64) : undefined;
  const logoData = company?.logoDataUrl ? decodeCompanyLogo(company.logoDataUrl) : undefined;
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = reportLines(report, company);
  const reservedBottom = signatureData ? BOTTOM + SIGNATURE_RESERVED_HEIGHT : BOTTOM + 28;
  const firstPageStartY = TOP - 100;
  const continuationStartY = TOP - 30;
  const firstPageCapacity = Math.max(1, Math.floor((firstPageStartY - reservedBottom) / LINE_HEIGHT));
  const continuationCapacity = Math.max(1, Math.floor((continuationStartY - reservedBottom) / LINE_HEIGHT));
  const pageLines: string[][] = [];
  pageLines.push(lines.slice(0, firstPageCapacity));
  let offset = firstPageCapacity;
  while (offset < lines.length) {
    pageLines.push(lines.slice(offset, offset + continuationCapacity));
    offset += continuationCapacity;
  }
  if (pageLines.length === 0) pageLines.push([]);

  const embeddedLogo = logoData
    ? logoData.mime === "png"
      ? await pdf.embedPng(logoData.bytes)
      : await pdf.embedJpg(logoData.bytes)
    : undefined;
  const embeddedSignature = signatureData
    ? signatureData.mime === "image/png"
      ? await pdf.embedPng(signatureData.bytes)
      : await pdf.embedJpg(signatureData.bytes)
    : undefined;

  pageLines.forEach((pageLinesContent, pageIndex) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = pageIndex === 0 ? firstPageStartY : continuationStartY;
    if (pageIndex === 0) {
      drawFirstPageHeader(page, report, company, embeddedLogo, regularFont, boldFont);
    } else {
      page.drawText(safeText(company?.name || "BaseGrid"), {
        x: LEFT,
        y: TOP + 4,
        size: 9,
        font: boldFont,
        color: BRAND_NAVY,
      });
      page.drawText(`Rapportino ${safeText(report.id)}  |  ${safeText(report.date || "-")}`, {
        x: LEFT,
        y: TOP - 14,
        size: 7.5,
        font: regularFont,
        color: MUTED,
      });
      page.drawLine({
        start: { x: LEFT, y: TOP - 22 },
        end: { x: PAGE_WIDTH - LEFT, y: TOP - 22 },
        thickness: 2,
        color: BRAND_GREEN,
      });
    }

    for (const line of pageLinesContent) {
      if (!line) {
        y -= 7;
        continue;
      }
      if (isSectionHeading(line)) {
        page.drawRectangle({
          x: LEFT - 6,
          y: y - 4,
          width: PAGE_WIDTH - (LEFT - 6) * 2,
          height: 17,
          color: PALE,
        });
        page.drawText(line, {
          x: LEFT,
          y,
          size: 8.5,
          font: boldFont,
          color: BRAND_NAVY,
        });
      } else {
        page.drawText(line, {
          x: LEFT,
          y,
          size: 9,
          font: regularFont,
          color: INK,
          maxWidth: PAGE_WIDTH - LEFT * 2,
        });
      }
      y -= LINE_HEIGHT;
    }

    if (embeddedSignature && pageIndex === pageLines.length - 1) {
      const maxWidth = 180;
      const maxHeight = 55;
      const scale = Math.min(maxWidth / embeddedSignature.width, maxHeight / embeddedSignature.height, 1);
      const width = embeddedSignature.width * scale;
      const height = embeddedSignature.height * scale;
      page.drawText("Firma cliente:", {
        x: LEFT,
        y: BOTTOM + 70,
        size: 8.5,
        font: boldFont,
        color: BRAND_NAVY,
      });
      page.drawImage(embeddedSignature, {
        x: LEFT,
        y: BOTTOM + 8,
        width,
        height,
      });
    }
    drawPageFooter(page, pageIndex, pageLines.length, regularFont);
  });

  pdf.setTitle(`Rapportino ${safeText(report.id)}`);
  pdf.setSubject("Rapportino di intervento");
  pdf.setCreator("BaseGrid");
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}
