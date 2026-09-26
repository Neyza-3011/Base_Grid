/**
 * Reports Service Adapter (Server-Authoritative)
 * Completely delegates persistence and retrieval to the backend API.
 * localStorage usage and static seed data have been eliminated.
 */

import {
  fetchReports,
  createReport as apiCreateReport,
  deleteReport as apiDeleteReport,
  Report,
  MaterialItem,
  CreateReportPayload,
} from "./api/reports";

export type { Report, MaterialItem, CreateReportPayload };

export interface AddReportInput {
  clientName: string;
  clientAddress?: string;
  clientCity?: string;
  technicianName?: string;
  hours: number;
  travelHours?: number;
  materials?: MaterialItem[];
  status?: "draft" | "submitted" | "approved";
  notes?: string;
  date?: string; // YYYY-MM-DD or DD/MM/YYYY
  time?: string; // HH:mm
  signatureBase64?: string;
}

/**
 * Fetch reports directly and exclusively from the backend server.
 */
export async function getReports(limit: number = 1000): Promise<Report[]> {
  return await fetchReports(limit);
}

/**
 * Creates a report on the backend server and returns the verified record.
 * Throws if the backend call fails; does NOT write to local storage or mock responses.
 */
export async function addReport(input: AddReportInput): Promise<Report> {
  const now = new Date();

  // Format date as YYYY-MM-DD for backend API
  let dateYYYYMMDD = now.toISOString().split("T")[0];
  if (input.date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      dateYYYYMMDD = input.date;
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input.date)) {
      const [d, m, y] = input.date.split("/");
      dateYYYYMMDD = `${y}-${m}-${d}`;
    }
  }

  // Format time as HH:mm
  let timeHHmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (input.time && /^\d{1,2}:\d{2}$/.test(input.time)) {
    const parts = input.time.split(":");
    timeHHmm = `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }

  const payload: CreateReportPayload = {
    client_name: input.clientName.trim(),
    client_address: input.clientAddress?.trim() || undefined,
    client_city: input.clientCity?.trim() || undefined,
    work_hours: Number(input.hours) || 0,
    travel_hours: Number(input.travelHours) || 0,
    date: dateYYYYMMDD,
    time: timeHHmm,
    status: input.status === "draft" ? "draft" : "submitted",
    notes: input.notes?.trim() || undefined,
    materials_used: Array.isArray(input.materials) ? input.materials : [],
    signature_base64: input.signatureBase64 || undefined,
  };

  return await apiCreateReport(payload);
}

/**
 * Deletes a report on the backend server.
 * Throws if the backend call fails; does NOT fake local deletion.
 */
export async function removeReport(reportId: string): Promise<boolean> {
  return await apiDeleteReport(reportId);
}
