import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
  db.seedInitialData();
  await db.updateCompany("comp-rossi-001", { address: "" });
  const owner = await db.findUserByEmail("admin@rossi.it");
  if (!owner) throw new Error("Seed owner fixture not found");
  await db.updateUser(owner.id, { role: "owner" });
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
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

async function request(
  path: string,
  userEmail: string,
  csrf = "csrf",
  options: { method?: string; body?: unknown } = {},
) {
  const user = await db.findUserByEmail(userEmail);
  if (!user) throw new Error(`Missing test user: ${userEmail}`);
  const { accessToken } = generateTokens(user);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      cookie: `access_token=${accessToken}; csrf_token=${csrf}`,
      "x-csrf-token": csrf,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, body: await response.json() };
}

describe("mandatory company setup gate", () => {
  it("blocks tenant workflow APIs until the owner completes setup, while preserving session access", async () => {
    const blocked = await request("/api/v1/users/me", "admin@rossi.it");
    expect(blocked.response.status).toBe(403);
    expect(blocked.body.code).toBe("COMPANY_SETUP_REQUIRED");

    const session = await request("/api/v1/auth/session", "admin@rossi.it");
    expect(session.response.status).toBe(200);

    const settings = await request("/api/v1/company/settings", "admin@rossi.it");
    expect(settings.response.status).toBe(200);
  });

  it("does not let a non-owner use company settings to bypass owner-only onboarding", async () => {
    const blocked = await request("/api/v1/company/settings", "tech@rossi.it");
    expect(blocked.response.status).toBe(403);
    expect(blocked.body.detail).toMatch(/titolare/i);
  });

  it("unblocks tenant workflows after the persisted company address is set", async () => {
    await db.updateCompany("comp-rossi-001", { address: "Via Demo 10, Roma" });
    const allowed = await request("/api/v1/users/me", "admin@rossi.it");
    expect(allowed.response.status).toBe(200);
  });

  it("persists the first onboarding step without overwriting settings from later steps", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    if (!before) throw new Error("Seed company fixture not found");

    const saved = await request("/api/v1/company/settings", "admin@rossi.it", "csrf-step-one", {
      method: "PUT",
      body: {
        name: "Impianti Rossi Srl",
        address: "Via Demo 10, Roma",
      },
    });

    expect(saved.response.status).toBe(200);
    const persisted = await db.findCompanyById("comp-rossi-001");
    expect(persisted).toMatchObject({
      name: "Impianti Rossi Srl",
      address: "Via Demo 10, Roma",
      defaultHourlyRate: before.defaultHourlyRate,
      reportFooterNotes: before.reportFooterNotes,
      vatNumber: before.vatNumber,
    });

    const workflow = await request("/api/v1/users/me", "admin@rossi.it");
    expect(workflow.response.status).toBe(200);
  });

  it("persists setup through the real company settings HTTP route and then unlocks workflows", async () => {
    const saved = await request("/api/v1/company/settings", "admin@rossi.it", "csrf-save", {
      method: "PUT",
      body: {
        name: "Impianti Rossi Srl",
        address: "Via Demo 10, Roma",
        vat_number: "IT12345678901",
        default_hourly_rate: 45,
        report_footer_notes: "Interventi verificati",
      },
    });

    expect(saved.response.status).toBe(200);
    const persisted = await db.findCompanyById("comp-rossi-001");
    expect(persisted).toMatchObject({
      name: "Impianti Rossi Srl",
      address: "Via Demo 10, Roma",
      vatNumber: "IT12345678901",
      defaultHourlyRate: 45,
      reportFooterNotes: "Interventi verificati",
    });

    const workflow = await request("/api/v1/users/me", "admin@rossi.it");
    expect(workflow.response.status).toBe(200);
  });

  it("rejects invalid setup without mutating persisted company settings", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    const rejected = await request("/api/v1/company/settings", "admin@rossi.it", "csrf-invalid", {
      method: "PUT",
      body: {
        name: "Impianti Rossi Srl",
        address: "   ",
      },
    });

    expect(rejected.response.status).toBe(400);
    const after = await db.findCompanyById("comp-rossi-001");
    expect(after?.name).toBe(before?.name);
    expect(after?.address).toBe(before?.address);
  });
});
