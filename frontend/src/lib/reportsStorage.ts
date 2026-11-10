/**
 * Reports Service Adapter (Server-Authoritative)
 * Completely delegates persistence and retrieval to the backend API.
 * localStorage usage and static seed data have been eliminated.
 */

import {
  fetchReports,
  createReport as apiCreateReport,
  updateDraftReport as apiUpdateDraftReport,
  deleteReport as apiDeleteReport,
  Report,
  MaterialItem,
  MaterialsStatus,
  CreateReportPayload,
  UpdateDraftReportPayload,
} from "./api/reports";

export type {
  Report,
  MaterialItem,
  MaterialsStatus,
  CreateReportPayload,
  UpdateDraftReportPayload,
};

/** Formats a Date using the user's local calendar date, not UTC. */
export function formatLocalDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface AddReportInput {
  clientName: string;
  clientAddress?: string;
  clientCity?: string;
  customerId?: string;
  locationId?: string;
  interventionId?: string;
  technicianName?: string;
  hours: number;
  travelHours?: number;
  materialsStatus?: MaterialsStatus;
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
  let dateYYYYMMDD = formatLocalDateISO(now);
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
    customer_id: input.customerId,
    location_id: input.locationId,
    work_hours: Number(input.hours) || 0,
    travel_hours: Number(input.travelHours) || 0,
    date: dateYYYYMMDD,
    time: timeHHmm,
    status: input.status === "draft" ? "draft" : "submitted",
    notes: input.notes?.trim() || undefined,
    materials_status:
      input.materialsStatus ||
      (input.materials && input.materials.length > 0 ? "used" : "unverified"),
    materials_used: Array.isArray(input.materials) ? input.materials : [],
    signature_base64: input.signatureBase64 || undefined,
  };

  if (input.interventionId && input.interventionId.trim() !== "") {
    payload.intervention_id = input.interventionId.trim();
  }

  return await apiCreateReport(payload);
}

/** Update a draft through the authenticated API. */
export async function updateDraftReport(
  reportId: string,
  input: AddReportInput & { date: string; time: string },
): Promise<Report> {
  let dateYYYYMMDD = input.date;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input.date)) {
    const [day, month, year] = input.date.split("/");
    dateYYYYMMDD = `${year}-${month}-${day}`;
  }
  const payload: UpdateDraftReportPayload = {
    client_name: input.clientName.trim(),
    client_address: input.clientAddress?.trim() || "",
    client_city: input.clientCity?.trim() || "",
    work_hours: Number(input.hours),
    travel_hours: Number(input.travelHours ?? 0),
    date: dateYYYYMMDD,
    time: input.time,
    notes: input.notes?.trim() || "",
    materials_status: input.materialsStatus || "unverified",
    materials_used: Array.isArray(input.materials) ? input.materials : [],
    status: input.status === "submitted" ? "submitted" : "draft",
    signature_base64: input.signatureBase64 || undefined,
  };
  return await apiUpdateDraftReport(reportId, payload);
}

/**
 * Deletes a report on the backend server.
 * Throws if the backend call fails; does NOT fake local deletion.
 */
export async function removeReport(reportId: string): Promise<boolean> {
  return await apiDeleteReport(reportId);
}
