import { PDFDocument, StandardFonts } from "pdf-lib";
import { ReportRecord } from "../types";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const TOP = 790;
const BOTTOM = 52;
const SIGNATURE_RESERVED_HEIGHT = 105;
const LINE_HEIGHT = 15;
const MAX_CHARS = 88;

function safeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(value: string, maxChars = MAX_CHARS): string[] {
  const normalized = safeText(value).trim();
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
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatMaterials(report: ReportRecord): string[] {
  const materials = Array.isArray(report.materialsUsed) ? report.materialsUsed : [];
  if (report.materialsStatus === "none") return ["Materiali: nessuno dichiarato"];
  if (report.materialsStatus === "used" && materials.length) {
    return ["Materiali utilizzati:", ...materials.map((item) => `- ${item.name}: ${item.quantity}`)];
  }
  return ["Materiali: non verificati"];
}

function reportLines(report: ReportRecord, hasSignature: boolean): string[] {
  const client = report.client || { name: "", address: "", city: "" };
  const technician = report.technician || { fullName: "" };
  const lines = [
    "BASEGRID - RAPPORTINO DI INTERVENTO",
    "----------------------------------------",
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
    ...formatMaterials(report),
    "",
    "NOTE",
    ...(report.notes ? wrapLine(report.notes) : ["Nessuna nota inserita"]),
    "",
    `Firma cliente: ${hasSignature ? "immagine inclusa sotto" : "non presente"}`,
    `Creato il: ${report.createdAt || "-"}`,
    "",
    "Documento generato automaticamente da BaseGrid.",
  ];
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

/**
 * Creates a standards-based PDF and embeds validated PNG/JPEG customer signatures.
 * The signature is decoded only on the server and is never included in report JSON DTOs.
 */
export async function generateReportPdf(report: ReportRecord): Promise<Buffer> {
  const signatureData = report.signatureBase64 ? decodeSignature(report.signatureBase64) : undefined;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = reportLines(report, Boolean(signatureData));
  const linesPerPage = Math.floor((TOP - (signatureData ? BOTTOM + SIGNATURE_RESERVED_HEIGHT : BOTTOM)) / LINE_HEIGHT);
  const pageLines: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pageLines.push(lines.slice(i, i + linesPerPage));
  }
  if (pageLines.length === 0) pageLines.push([]);

  const embeddedSignature = signatureData
    ? signatureData.mime === "image/png"
      ? await pdf.embedPng(signatureData.bytes)
      : await pdf.embedJpg(signatureData.bytes)
    : undefined;

  pageLines.forEach((pageLinesContent, pageIndex) => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = TOP;
    for (const line of pageLinesContent) {
      page.drawText(line, { x: LEFT, y, size: 10, font });
      y -= LINE_HEIGHT;
    }
    if (embeddedSignature && pageIndex === pageLines.length - 1) {
      const maxWidth = 180;
      const maxHeight = 55;
      const scale = Math.min(maxWidth / embeddedSignature.width, maxHeight / embeddedSignature.height, 1);
      const width = embeddedSignature.width * scale;
      const height = embeddedSignature.height * scale;
      page.drawText("Firma cliente:", { x: LEFT, y: BOTTOM + 70, size: 9, font });
      page.drawImage(embeddedSignature, {
        x: LEFT,
        y: BOTTOM + 8,
        width,
        height,
      });
    }
  });

  pdf.setTitle(`Rapportino BaseGrid ${safeText(report.id)}`);
  pdf.setCreator("BaseGrid");
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}
