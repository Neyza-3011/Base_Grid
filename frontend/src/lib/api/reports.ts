import { appendCsrfHeaders } from "../auth";

export type MaterialItem = {
  name: string;
  quantity: number;
};

export type Report = {
  id: string;
  date: string;
  time: string;
  dateTimeFormatted: string;
  work_hours: number;
  travel_hours: number;
  status: "draft" | "submitted" | "approved";
  client: {
    name: string;
    address?: string;
    city?: string;
  };
  technician: {
    full_name: string;
  };
  materials_used: MaterialItem[];
  notes?: string;
  signature_base64?: string;
  created_at: string;
};

export type CreateReportPayload = {
  client_name: string;
  client_address?: string;
  client_city?: string;
  work_hours: number;
  travel_hours?: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  notes?: string;
  materials_used?: MaterialItem[];
  status?: "draft" | "submitted" | "approved";
  signature_base64?: string;
};

export type ApiReportResponse = {
  id: string;
  date: string;
  time: string;
  work_hours: number;
  travel_hours: number;
  status: "draft" | "submitted" | "approved";
  client: {
    name: string;
    address?: string;
    city?: string;
  };
  technician: {
    full_name: string;
  };
  materials_used: MaterialItem[];
  notes?: string;
  created_at: string;
};

export class ReportsApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReportsApiError";
    this.status = status;
    Object.setPrototypeOf(this, ReportsApiError.prototype);
  }
}

/**
 * Format date and time for presentation from server values.
 */
export function formatReportDateTime(
  rawDate?: string,
  rawTime?: string,
): {
  date: string;
  time: string;
  dateTimeFormatted: string;
} {
  const dateStr = rawDate || new Date().toISOString().split("T")[0];
  let formattedDate = dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    formattedDate = `${d}/${m}/${y}`;
  }
  const timeStr = rawTime || "10:00";
  return {
    date: formattedDate,
    time: timeStr,
    dateTimeFormatted: `${formattedDate} ${timeStr}`,
  };
}

/**
 * Centralized mapping from Server DTO to Frontend View Model.
 */
export function mapDtoToReport(dto: ApiReportResponse): Report {
  const { date, time, dateTimeFormatted } = formatReportDateTime(dto.date, dto.time);
  return {
    id: dto.id,
    date,
    time,
    dateTimeFormatted,
    work_hours: typeof dto.work_hours === "number" ? dto.work_hours : 0,
    travel_hours: typeof dto.travel_hours === "number" ? dto.travel_hours : 0,
    status: dto.status || "submitted",
    client: {
      name: dto.client?.name || "Cliente Senza Nome",
      address: dto.client?.address || "",
      city: dto.client?.city || "",
    },
    technician: {
      full_name: dto.technician?.full_name || "Tecnico",
    },
    materials_used: Array.isArray(dto.materials_used) ? dto.materials_used : [],
    notes: dto.notes || "",
    created_at: dto.created_at || new Date().toISOString(),
  };
}

/**
 * Handle API responses and normalize errors safely.
 */
async function parseResponseOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }

  let errorMessage = "Errore durante la richiesta.";
  try {
    const errorData = await res.json();
    if (errorData && typeof errorData.detail === "string") {
      errorMessage = errorData.detail;
    }
  } catch {
    // Non-JSON or empty response body
  }

  if (res.status === 401) {
    errorMessage = "Non autenticato o sessione scaduta.";
  } else if (res.status === 403) {
    errorMessage = "Accesso non autorizzato.";
  } else if (res.status === 404) {
    errorMessage = "Rapportino non trovato.";
  } else if (res.status === 413) {
    errorMessage = "File o firma troppo grande (massimo 500KB).";
  } else if (res.status >= 500) {
    errorMessage = "Errore interno del server.";
  }

  throw new ReportsApiError(errorMessage, res.status);
}

/**
 * Fetch all reports from the backend for the current authenticated tenant.
 */
export async function fetchReports(limit: number = 1000): Promise<Report[]> {
  try {
    const res = await fetch(`/api/v1/reports?limit=${limit}`, {
      method: "GET",
      credentials: "include",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
    });

    const data = await parseResponseOrThrow<ApiReportResponse[]>(res);
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map(mapDtoToReport);
  } catch (err: unknown) {
    if (err instanceof ReportsApiError) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Impossibile connettersi al server dei rapportini.";
    throw new ReportsApiError(message, 0);
  }
}

/**
 * Create a new report on the backend server.
 */
export async function createReport(payload: CreateReportPayload): Promise<Report> {
  try {
    const res = await fetch("/api/v1/reports", {
      method: "POST",
      credentials: "include",
      headers: appendCsrfHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
      body: JSON.stringify(payload),
    });

    const createdDto = await parseResponseOrThrow<ApiReportResponse>(res);
    return mapDtoToReport(createdDto);
  } catch (err: unknown) {
    if (err instanceof ReportsApiError) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Impossibile salvare il rapportino sul server.";
    throw new ReportsApiError(message, 0);
  }
}

/**
 * Delete a report on the backend server.
 */
export async function deleteReport(reportId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
    });

    await parseResponseOrThrow<{ message: string }>(res);
    return true;
  } catch (err: unknown) {
    if (err instanceof ReportsApiError) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Impossibile eliminare il rapportino dal server.";
    throw new ReportsApiError(message, 0);
  }
}

/**
 * Fetch the official PDF blob for a given report.
 */
export async function fetchReportPdfBlob(reportId: string): Promise<Blob> {
  try {
    const res = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}/pdf`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new ReportsApiError("Rapportino non trovato.", 404);
      }
      if (res.status >= 500) {
        throw new ReportsApiError("Errore interno durante la generazione del PDF.", res.status);
      }
      throw new ReportsApiError("Impossibile scaricare il PDF del rapportino.", res.status);
    }

    return await res.blob();
  } catch (err: unknown) {
    if (err instanceof ReportsApiError) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Errore di connessione durante lo scaricamento del PDF.";
    throw new ReportsApiError(message, 0);
  }
}
