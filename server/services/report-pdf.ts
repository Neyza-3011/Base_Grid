import { ReportRecord } from "../types";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const TOP = 790;
const BOTTOM = 52;
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

function escapePdfLiteral(value: string): string {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

function reportLines(report: ReportRecord): string[] {
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
    `Firma cliente: ${report.signatureBase64 ? "presente nei dati del rapportino" : "non presente"}`,
    `Creato il: ${report.createdAt || "-"}`,
    "",
    "Documento generato automaticamente da BaseGrid.",
  ];
  return lines.flatMap((line) => wrapLine(line));
}

function contentStream(lines: string[]): string {
  let y = TOP;
  const commands = ["BT", "/F1 10 Tf", `${LEFT} ${TOP} Td`, `${LINE_HEIGHT} TL`];
  for (const line of lines) {
    if (y < BOTTOM) break;
    commands.push(`(${escapePdfLiteral(line)}) Tj`, "T*");
    y -= LINE_HEIGHT;
  }
  commands.push("ET");
  return commands.join("\n");
}

/**
 * Creates a small self-contained PDF 1.4 document using the built-in Helvetica
 * font. Text is normalized to printable ASCII so offsets and stream lengths are
 * deterministic and the output does not depend on an external PDF service.
 */
export function generateReportPdf(report: ReportRecord): Buffer {
  const allLines = reportLines(report);
  const linesPerPage = Math.floor((TOP - BOTTOM) / LINE_HEIGHT);
  const pageLines: string[][] = [];
  for (let i = 0; i < allLines.length; i += linesPerPage) {
    pageLines.push(allLines.slice(i, i + linesPerPage));
  }
  if (pageLines.length === 0) pageLines.push([]);

  const objects: string[] = [];
  const pageObjectIds = pageLines.map((_, index) => 4 + index * 2);
  const contentObjectIds = pageLines.map((_, index) => 5 + index * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageLines.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  pageLines.forEach((lines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    const stream = contentStream(lines);
    const streamLength = Buffer.byteLength(stream, "ascii");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
    if (pageId !== 4 + index * 2 || contentId !== pageId + 1) {
      throw new Error("Internal PDF object index mismatch");
    }
  });

  let pdf = "%PDF-1.4\n%BaseGrid\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
