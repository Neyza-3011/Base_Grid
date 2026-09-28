import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getInterventions,
  getInterventionById,
  createIntervention,
  updateIntervention,
  transitionInterventionStatus,
  InterventionsApiError,
} from "./interventions";

describe("Frontend Interventions API Client (frontend/src/lib/api/interventions.ts)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches interventions with filters successfully", async () => {
    const mockResponse = {
      items: [
        {
          id: "int-001",
          customerId: "cust-001",
          locationId: "loc-001",
          description: "Manutenzione",
          priority: "alta",
          status: "nuovo",
          createdBy: "usr-001",
          updatedBy: "usr-001",
          createdAt: "2026-10-01T10:00:00.000Z",
          updatedAt: "2026-10-01T10:00:00.000Z",
          customerName: "Condominio Alpha",
          locationName: "Centrale Termica",
        },
      ],
      totalCount: 1,
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await getInterventions({
      status: "nuovo",
      priority: "alta",
      search: "Manutenzione",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/interventions?search=Manutenzione&status=nuovo&priority=alta",
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );

    expect(result.items.length).toBe(1);
    expect(result.items[0].description).toBe("Manutenzione");
    expect(result.items[0].customerName).toBe("Condominio Alpha");
  });

  it("fetches a single intervention by ID", async () => {
    const mockIntervention = {
      id: "int-123",
      customerId: "cust-1",
      locationId: "loc-1",
      description: "Guasto quadro",
      priority: "urgente",
      status: "in_lavorazione",
      createdBy: "usr-1",
      updatedBy: "usr-1",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockIntervention,
    });

    const result = await getInterventionById("int-123");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/interventions/int-123",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.id).toBe("int-123");
    expect(result.priority).toBe("urgente");
  });

  it("creates a new intervention and passes CSRF token", async () => {
    const payload = {
      customerId: "cust-1",
      locationId: "loc-1",
      description: "Installazione contatore",
      priority: "media" as const,
    };

    const mockCreated = {
      id: "int-created",
      ...payload,
      status: "nuovo",
      createdBy: "usr-admin",
      updatedBy: "usr-admin",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockCreated,
    });

    const result = await createIntervention(payload);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/interventions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(result.id).toBe("int-created");
    expect(result.status).toBe("nuovo");
  });

  it("triggers a status transition via API", async () => {
    const mockTransitioned = {
      id: "int-123",
      customerId: "cust-1",
      locationId: "loc-1",
      description: "Intervento",
      priority: "media",
      status: "assegnato",
      technicianId: "usr-tech-1",
      createdBy: "usr-1",
      updatedBy: "usr-1",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T11:00:00.000Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockTransitioned,
    });

    const result = await transitionInterventionStatus("int-123", {
      targetStatus: "assegnato",
      technicianId: "usr-tech-1",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/interventions/int-123/transition",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          targetStatus: "assegnato",
          technicianId: "usr-tech-1",
        }),
      }),
    );
    expect(result.status).toBe("assegnato");
    expect(result.technicianId).toBe("usr-tech-1");
  });

  it("throws InterventionsApiError with server detail when API returns error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "La sede selezionata non appartiene al cliente indicato." }),
    });

    await expect(
      createIntervention({
        customerId: "cust-1",
        locationId: "loc-wrong",
        description: "Test err",
      }),
    ).rejects.toThrow("La sede selezionata non appartiene al cliente indicato.");
  });
});
