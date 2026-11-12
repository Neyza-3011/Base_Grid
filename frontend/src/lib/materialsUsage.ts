import type { Report } from "@/lib/api/reports";

export type MaterialUsageRow = {
  key: string;
  name: string;
  quantity: number;
  reportId: string;
  clientName: string;
  technicianName: string;
  date: string;
  createdAt: string;
  reportStatus: Report["status"];
};

export type MaterialsSummary = {
  distinctMaterials: number;
  totalQuantity: number;
  reportsWithNoMaterials: number;
  reportsUnverified: number;
};

export function buildMaterialUsageRows(reports: Report[]): MaterialUsageRow[] {
  const rows: MaterialUsageRow[] = [];

  for (const report of reports) {
    if (report.materials_status !== "used" || !Array.isArray(report.materials_used)) {
      continue;
    }

    report.materials_used.forEach((material, index) => {
      const name = typeof material.name === "string" ? material.name.trim() : "";
      const quantity = material.quantity;
      if (!name || !Number.isFinite(quantity) || quantity <= 0) return;

      rows.push({
        key: `${report.id}:${index}`,
        name,
        quantity,
        reportId: report.id,
        clientName: report.client?.name || "Cliente non indicato",
        technicianName: report.technician?.full_name || "Tecnico non indicato",
        date: report.dateTimeFormatted || `${report.date} ${report.time}`,
        createdAt: report.created_at || "",
        reportStatus: report.status,
      });
    });
  }

  return rows.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function summarizeMaterials(reports: Report[], rows: MaterialUsageRow[]): MaterialsSummary {
  const distinctMaterials = new Set(rows.map((row) => row.name.trim().toLocaleLowerCase("it")));

  return {
    distinctMaterials: distinctMaterials.size,
    totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
    reportsWithNoMaterials: reports.filter((report) => report.materials_status === "none").length,
    // An inconsistent legacy record marked "used" without any items is not a verified zero.
    reportsUnverified: reports.filter(
      (report) =>
        !report.materials_status ||
        report.materials_status === "unverified" ||
        (report.materials_status === "used" && report.materials_used.length === 0),
    ).length,
  };
}
