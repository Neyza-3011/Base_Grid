import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";

let server: http.Server;
let baseUrl: string;

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
  db.seedInitialData();

  await new Promise<void>((resolve) => {
    server = http.createServer(createApp());
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getWithUser(path: string, email: string) {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Missing seeded test user: ${email}`);
  const { accessToken } = generateTokens(user);
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: `access_token=${accessToken}` },
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON response is still represented by its HTTP status.
  }
  return { status: response.status, body };
}

async function putWithUser(path: string, email: string, payload: unknown) {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Missing seeded test user: ${email}`);
  const { accessToken } = generateTokens(user);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: `access_token=${accessToken}; csrf_token=test-csrf-token`,
      "x-csrf-token": "test-csrf-token",
    },
    body: JSON.stringify(payload),
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Preserve HTTP status when the response is not JSON.
  }
  return { status: response.status, body };
}


async function postWithUser(path: string, email: string, payload?: unknown) {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Missing seeded test user: ${email}`);
  const { accessToken } = generateTokens(user);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      cookie: `access_token=${accessToken}; csrf_token=test-csrf-token`,
      "x-csrf-token": "test-csrf-token",
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  let body: any = null;
  try { body = await response.json(); } catch { /* Keep status for non-JSON responses. */ }
  return { status: response.status, body };
}

async function getWithoutUser(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON response is still represented by its HTTP status.
  }
  return { status: response.status, body };
}

describe("Platform admin endpoint authorization", () => {
  it.each([
    "/api/v1/admin/stats",
    "/api/v1/admin/tenants",
    "/api/v1/admin/tenants/comp-rossi-001",
  ])("rejects unauthenticated access to %s", async (path) => {
    const response = await getWithoutUser(path);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ detail: "Non autenticato o sessione scaduta." });
  });

  it.each(["/api/v1/admin/stats", "/api/v1/admin/tenants"])(
    "denies a company admin access to %s",
    async (path) => {
      const response = await getWithUser(path, "admin@rossi.it");

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        detail: "Accesso negato: permessi piattaforma insufficienti.",
      });
    },
  );

  it("allows the CEO to read a tenant profile and safe user summaries without credential material", async () => {
    const response = await getWithUser(
      "/api/v1/admin/tenants/comp-rossi-001",
      "jack.cardinali15@gmail.com",
    );

    expect(response.status).toBe(200);
    expect(response.body.company).toMatchObject({
      id: "comp-rossi-001",
      name: "Rossi Impianti Srl",
      setup_complete: true,
    });
    expect(response.body.user_count).toBe(2);
    expect(response.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "admin@rossi.it",
          role: "admin",
          is_active: true,
        }),
      ]),
    );
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("salt");
    expect(serialized).not.toContain("authVersion");
    expect(serialized).not.toContain("tokenHash");
  });

  it("denies company admins access to tenant detail even with a known company ID", async () => {
    const response = await getWithUser(
      "/api/v1/admin/tenants/comp-rossi-001",
      "admin@rossi.it",
    );
    expect(response.status).toBe(403);
  });


  it("allows the CEO to update only validated tenant profile fields and persists the change", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    expect(before).toBeTruthy();

    const response = await putWithUser(
      "/api/v1/admin/tenants/comp-rossi-001/profile",
      "jack.cardinali15@gmail.com",
      {
        name: "Rossi Impianti Aggiornata",
        address: "Via Roma 25, Milano",
        default_hourly_rate: 72.5,
        report_footer_notes: "Note aggiornate dal pannello CEO",
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.company).toMatchObject({
      id: "comp-rossi-001",
      name: "Rossi Impianti Aggiornata",
      address: "Via Roma 25, Milano",
      default_hourly_rate: 72.5,
      report_footer_notes: "Note aggiornate dal pannello CEO",
    });
    const after = await db.findCompanyById("comp-rossi-001");
    expect(after?.name).toBe("Rossi Impianti Aggiornata");
    expect(after?.address).toBe("Via Roma 25, Milano");
    expect(after?.defaultHourlyRate).toBe(72.5);
    expect(after?.reportFooterNotes).toBe("Note aggiornate dal pannello CEO");
    expect(after?.stripeSubscriptionStatus).toBe(before?.stripeSubscriptionStatus);
    expect(after?.maxUsers).toBe(before?.maxUsers);
    expect(after?.featurePdfExport).toBe(before?.featurePdfExport);
  });

  it("denies tenant admins from updating another tenant through the platform profile endpoint", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    const response = await putWithUser(
      "/api/v1/admin/tenants/comp-rossi-001/profile",
      "admin@rossi.it",
      { name: "Unauthorized update" },
    );

    expect(response.status).toBe(403);
    expect((await db.findCompanyById("comp-rossi-001"))?.name).toBe(before?.name);
  });

  it("rejects unsupported admin profile fields and malformed values without changing persisted data", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    const unsupported = await putWithUser(
      "/api/v1/admin/tenants/comp-rossi-001/profile",
      "jack.cardinali15@gmail.com",
      { stripe_subscription_status: "canceled" },
    );
    const malformed = await putWithUser(
      "/api/v1/admin/tenants/comp-rossi-001/profile",
      "jack.cardinali15@gmail.com",
      { name: { nested: "not a string" } },
    );

    expect(unsupported.status).toBe(400);
    expect(malformed.status).toBe(400);
    const after = await db.findCompanyById("comp-rossi-001");
    expect(after?.name).toBe(before?.name);
    expect(after?.stripeSubscriptionStatus).toBe(before?.stripeSubscriptionStatus);
  });


  it("allows the CEO to update a tenant user's profile and role with persisted changes", async () => {
    const target = await db.findUserByEmail("tech@rossi.it");
    expect(target).toBeTruthy();
    const response = await putWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}`,
      "jack.cardinali15@gmail.com",
      { full_name: "Luca Tecnico Aggiornato", phone_number: "+39 333 0000000", role: "dispatcher" },
    );
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: target!.id,
      full_name: "Luca Tecnico Aggiornato",
      phone_number: "+39 333 0000000",
      role: "dispatcher",
    });
    const persisted = await db.findUserById(target!.id);
    expect(persisted).toMatchObject({
      fullName: "Luca Tecnico Aggiornato",
      phoneNumber: "+39 333 0000000",
      role: "dispatcher",
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("authVersion");
  });

  it("denies tenant admins from using CEO user-management endpoints without changing data", async () => {
    const target = await db.findUserByEmail("tech@rossi.it");
    expect(target).toBeTruthy();
    const before = await db.findUserById(target!.id);
    const update = await putWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}`,
      "admin@rossi.it",
      { full_name: "Unauthorized" },
    );
    const deactivate = await postWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}/deactivate`,
      "admin@rossi.it",
    );
    expect(update.status).toBe(403);
    expect(deactivate.status).toBe(403);
    expect(await db.findUserById(target!.id)).toMatchObject({
      fullName: before!.fullName,
      isActive: before!.isActive,
    });
  });

  it("lets the CEO deactivate and reactivate a tenant user with persisted status changes", async () => {
    const target = await db.findUserByEmail("tech@rossi.it");
    expect(target).toBeTruthy();
    const deactivated = await postWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}/deactivate`,
      "jack.cardinali15@gmail.com",
    );
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.user.is_active).toBe(false);
    expect((await db.findUserById(target!.id))?.isActive).toBe(false);

    const activated = await postWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}/activate`,
      "jack.cardinali15@gmail.com",
    );
    expect(activated.status).toBe(200);
    expect(activated.body.user.is_active).toBe(true);
    expect((await db.findUserById(target!.id))?.isActive).toBe(true);
  });

  it("rejects attempts to modify or deactivate the CEO platform identity", async () => {
    const ceo = await db.findUserByEmail("jack.cardinali15@gmail.com");
    expect(ceo).toBeTruthy();
    const update = await putWithUser(
      `/api/v1/admin/tenants/${ceo!.companyId}/users/${ceo!.id}`,
      "jack.cardinali15@gmail.com",
      { full_name: "Renamed CEO" },
    );
    expect(update.status).toBe(403);
    expect((await db.findUserById(ceo!.id))?.fullName).toBe(ceo!.fullName);
  });

  it("rejects malformed CEO user updates without mutating persisted state", async () => {
    const target = await db.findUserByEmail("tech@rossi.it");
    expect(target).toBeTruthy();
    const before = await db.findUserById(target!.id);
    const response = await putWithUser(
      `/api/v1/admin/tenants/comp-rossi-001/users/${target!.id}`,
      "jack.cardinali15@gmail.com",
      { full_name: { invalid: true } },
    );
    expect(response.status).toBe(400);
    expect(await db.findUserById(target!.id)).toMatchObject({
      fullName: before!.fullName,
      role: before!.role,
    });
  });

  it("returns 404 for a nonexistent tenant ID", async () => {
    const response = await getWithUser(
      "/api/v1/admin/tenants/nonexistent-company",
      "jack.cardinali15@gmail.com",
    );
    expect(response.status).toBe(404);
  });

  it("allows the canonical platform CEO to read global stats and tenant summaries", async () => {
    const stats = await getWithUser("/api/v1/admin/stats", "jack.cardinali15@gmail.com");
    const tenants = await getWithUser("/api/v1/admin/tenants", "jack.cardinali15@gmail.com");

    expect(stats.status).toBe(200);
    expect(stats.body.total_tenants).toBeGreaterThan(0);
    expect(stats.body.total_users).toBeGreaterThan(0);

    expect(tenants.status).toBe(200);
    expect(Array.isArray(tenants.body)).toBe(true);
    expect(tenants.body.some((tenant: { id: string }) => tenant.id === "comp-rossi-001")).toBe(true);
  });
});
