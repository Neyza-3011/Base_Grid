import { appendCsrfHeaders } from "../auth";

export interface Customer {
  id: string;
  displayName: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  email?: string;
  phoneNumber?: string;
  pec?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  customerId: string;
  name: string;
  address: string;
  city: string;
  province?: string;
  postalCode?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  displayName: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  email?: string;
  phoneNumber?: string;
  pec?: string;
  notes?: string;
}

export type UpdateCustomerPayload = Partial<CreateCustomerPayload>;

export interface CreateLocationPayload {
  name: string;
  address: string;
  city: string;
  province?: string;
  postalCode?: string;
  notes?: string;
}

export type UpdateLocationPayload = Partial<CreateLocationPayload>;

export class CustomersApiError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CustomersApiError";
    this.status = status;
    Object.setPrototypeOf(this, CustomersApiError.prototype);
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
    errorMessage = "Risorsa non trovata o non accessibile.";
  } else if (res.status >= 500 && errorMessage === "Errore durante la richiesta.") {
    errorMessage = "Errore interno del server.";
  }

  throw new CustomersApiError(errorMessage, res.status);
}

export async function fetchCustomers(search?: string, activeOnly = true): Promise<Customer[]> {
  const query = new URLSearchParams();
  if (search) query.append("search", search);
  query.append("activeOnly", String(activeOnly));

  const res = await fetch(`/api/v1/customers?${query.toString()}`, {
    method: "GET",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Customer[]>(res);
}

export async function fetchCustomer(id: string): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Customer>(res);
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  const res = await fetch(`/api/v1/customers`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Customer>(res);
}

export async function updateCustomer(
  id: string,
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Customer>(res);
}

export async function archiveCustomer(id: string): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      Accept: "application/json",
    }),
  });
  return parseResponseOrThrow<Customer>(res);
}

export async function reactivateCustomer(id: string): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/${encodeURIComponent(id)}/reactivate`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      Accept: "application/json",
    }),
  });
  return parseResponseOrThrow<Customer>(res);
}

export async function fetchLocations(
  customerId: string,
  search?: string,
  activeOnly = true,
): Promise<Location[]> {
  const query = new URLSearchParams();
  if (search) query.append("search", search);
  query.append("activeOnly", String(activeOnly));

  const res = await fetch(
    `/api/v1/customers/${encodeURIComponent(customerId)}/locations?${query.toString()}`,
    {
      method: "GET",
      credentials: "include",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
    },
  );
  return parseResponseOrThrow<Location[]>(res);
}

export async function fetchLocation(id: string): Promise<Location> {
  const res = await fetch(`/api/v1/customers/locations/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
  });
  return parseResponseOrThrow<Location>(res);
}

export async function createLocation(
  customerId: string,
  payload: CreateLocationPayload,
): Promise<Location> {
  const res = await fetch(`/api/v1/customers/${encodeURIComponent(customerId)}/locations`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Location>(res);
}

export async function updateLocation(
  id: string,
  payload: UpdateLocationPayload,
): Promise<Location> {
  const res = await fetch(`/api/v1/customers/locations/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "include",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify(payload),
  });
  return parseResponseOrThrow<Location>(res);
}

export async function archiveLocation(id: string): Promise<Location> {
  const res = await fetch(`/api/v1/customers/locations/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      Accept: "application/json",
    }),
  });
  return parseResponseOrThrow<Location>(res);
}

export async function reactivateLocation(id: string): Promise<Location> {
  const res = await fetch(`/api/v1/customers/locations/${encodeURIComponent(id)}/reactivate`, {
    method: "POST",
    credentials: "include",
    headers: appendCsrfHeaders({
      Accept: "application/json",
    }),
  });
  return parseResponseOrThrow<Location>(res);
}
