import { appendCsrfHeaders } from "../auth";

export type InterventionPriority = "bassa" | "media" | "alta" | "urgente";

export type InterventionStatus =
  | "nuovo"
  | "da_assegnare"
  | "assegnato"
  | "in_viaggio"
  | "sul_posto"
  | "in_lavorazione"
  | "in_attesa"
  | "completato"
  | "verificato"
  | "pronto_per_fatturazione"
  | "fatturato";

export interface Intervention {
  id: string;
  customerId: string;
  locationId: string;
  assetId?: string;
  description: string;
  problem?: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  scheduledStart?: string;
  scheduledEnd?: string;
  technicianId?: string;
  estimatedHours?: number;
  actualHours?: number;
  notes?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  locationName?: string;
  assetName?: string;
  technicianName?: string;
}

export interface CreateInterventionPayload {
  customerId: string;
  locationId: string;
  assetId?: string;
  description: string;
  problem?: string;
  priority?: InterventionPriority;
  scheduledStart?: string;
  scheduledEnd?: string;
  technicianId?: string;
  estimatedHours?: number;
  notes?: string;
}

export interface UpdateInterventionPayload {
  customerId?: string;
  locationId?: string;
  assetId?: string | null;
  description?: string;
  problem?: string | null;
  priority?: InterventionPriority;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  technicianId?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  notes?: string | null;
}

export interface TransitionInterventionPayload {
  targetStatus: InterventionStatus;
  technicianId?: string;
  actualHours?: number;
  notes?: string;
}

export interface GetInterventionsParams {
  search?: string;
  status?: string;
  priority?: string;
  technicianId?: string;
  customerId?: string;
  locationId?: string;
  assetId?: string;
  scheduledStartFrom?: string;
  scheduledStartTo?: string;
  limit?: number;
  cursor?: string;
}

export interface PaginatedInterventionsResponse {
  items: Intervention[];
  nextCursor?: string;
  totalCount?: number;
}

export class InterventionsApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "InterventionsApiError";
    this.status = status;
    Object.setPrototypeOf(this, InterventionsApiError.prototype);
  }
}

async function parseResponseOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }

  let errorMessage = "Errore durante la richiesta.";
  try {
    const errorData = await res.json();
    if (errorData && typeof errorData.detail === "string") {
      errorMessage = errorData.detail;
    } else if (errorData && typeof errorData.error === "string") {
      errorMessage = errorData.error;
    } else if (errorData && typeof errorData.message === "string") {
      errorMessage = errorData.message;
    }
  } catch {
    // Non-JSON response
  }

  throw new InterventionsApiError(errorMessage, res.status);
}

/**
 * Fetch list of interventions with filters and cursor pagination
 */
export async function getInterventions(
  params?: GetInterventionsParams,
): Promise<PaginatedInterventionsResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.technicianId) query.set("technicianId", params.technicianId);
  if (params?.customerId) query.set("customerId", params.customerId);
  if (params?.locationId) query.set("locationId", params.locationId);
  if (params?.assetId) query.set("assetId", params.assetId);
  if (params?.scheduledStartFrom) query.set("scheduledStartFrom", params.scheduledStartFrom);
  if (params?.scheduledStartTo) query.set("scheduledStartTo", params.scheduledStartTo);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.cursor) query.set("cursor", params.cursor);

  const qs = query.toString();
  const url = `/api/v1/interventions${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  return parseResponseOrThrow<PaginatedInterventionsResponse>(res);
}

/**
 * Fetch a single intervention by ID
 */
export async function getInterventionById(id: string): Promise<Intervention> {
  const res = await fetch(`/api/v1/interventions/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  return parseResponseOrThrow<Intervention>(res);
}

/**
 * Create a new intervention (created with status 'nuovo')
 */
export async function createIntervention(
  payload: CreateInterventionPayload,
): Promise<Intervention> {
  const headers = appendCsrfHeaders({ "Content-Type": "application/json" });

  const res = await fetch("/api/v1/interventions", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return parseResponseOrThrow<Intervention>(res);
}

/**
 * Update intervention details
 */
export async function updateIntervention(
  id: string,
  payload: UpdateInterventionPayload,
): Promise<Intervention> {
  const headers = appendCsrfHeaders({ "Content-Type": "application/json" });

  const res = await fetch(`/api/v1/interventions/${id}`, {
    method: "PUT",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return parseResponseOrThrow<Intervention>(res);
}

/**
 * Trigger a server-authoritative status transition
 */
export async function transitionInterventionStatus(
  id: string,
  payload: TransitionInterventionPayload,
): Promise<Intervention> {
  const headers = appendCsrfHeaders({ "Content-Type": "application/json" });

  const res = await fetch(`/api/v1/interventions/${id}/transition`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return parseResponseOrThrow<Intervention>(res);
}
