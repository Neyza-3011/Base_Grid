import { appendCsrfHeaders } from "../auth";

export type AssetType =
  | "quadro"
  | "fotovoltaico"
  | "inverter"
  | "batteria"
  | "wallbox"
  | "climatizzazione"
  | "automazione"
  | "allarme"
  | "rete_cablaggio"
  | "altro";

export type AssetStatus = "operativo" | "manutenzione" | "fuori_servizio" | "dismesso";

export interface Asset {
  id: string;
  customerId: string;
  locationId: string;
  assetType: AssetType;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEndDate?: string;
  status: AssetStatus;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetPayload {
  customerId: string;
  locationId: string;
  assetType: AssetType;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEndDate?: string;
  status?: AssetStatus;
  notes?: string;
}

export type UpdateAssetPayload = Partial<CreateAssetPayload>;

export class AssetsApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AssetsApiError";
    this.status = status;
    Object.setPrototypeOf(this, AssetsApiError.prototype);
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
    } else if (errorData && typeof errorData.message === "string") {
      errorMessage = errorData.message;
    }
  } catch {
    // Non-JSON or empty response body
  }

  if (res.status === 401 && errorMessage === "Errore durante la richiesta.") {
    errorMessage = "Non autenticato o sessione scaduta.";
  } else if (res.status === 403 && errorMessage === "Errore durante la richiesta.") {
    errorMessage = "Accesso non autorizzato.";
  } else if (res.status === 404 && errorMessage === "Errore durante la richiesta.") {
    errorMessage = "Impianto/Asset non trovato o non accessibile.";
  } else if (res.status >= 500 && errorMessage === "Errore durante la richiesta.") {
    errorMessage = "Errore interno del server.";
  }

  throw new AssetsApiError(errorMessage, res.status);
}

export interface FetchAssetsFilters {
  search?: string;
  customerId?: string;
  locationId?: string;
  assetType?: AssetType | string;
  status?: AssetStatus | string;
  activeOnly?: boolean;
  limit?: number;
}

export async function fetchAssets(filters?: FetchAssetsFilters): Promise<Asset[]> {
  const query = new URLSearchParams();
  if (filters?.search) query.append("search", filters.search);
  if (filters?.customerId) query.append("customerId", filters.customerId);
  if (filters?.locationId) query.append("locationId", filters.locationId);
  if (filters?.assetType) query.append("assetType", filters.assetType);
  if (filters?.status) query.append("status", filters.status);
  if (filters?.activeOnly !== undefined) query.append("activeOnly", String(filters.activeOnly));
  if (filters?.limit) query.append("limit", String(filters.limit));

  const res = await fetch(`/api/v1/assets?${query.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Asset[]>(res);
}

export async function fetchAsset(id: string): Promise<Asset> {
  const res = await fetch(`/api/v1/assets/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Asset>(res);
}

export async function createAsset(payload: CreateAssetPayload): Promise<Asset> {
  const res = await fetch("/api/v1/assets", {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Asset>(res);
}

export async function updateAsset(id: string, payload: UpdateAssetPayload): Promise<Asset> {
  const res = await fetch(`/api/v1/assets/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Asset>(res);
}

export async function archiveAsset(id: string): Promise<Asset> {
  const res = await fetch(`/api/v1/assets/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Asset>(res);
}

export async function reactivateAsset(id: string): Promise<Asset> {
  const res = await fetch(`/api/v1/assets/${encodeURIComponent(id)}/reactivate`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Asset>(res);
}
