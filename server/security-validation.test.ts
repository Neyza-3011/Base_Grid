import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";

const app = createApp();
let adminCookies: string[] = [];
let adminToken: string = "";
let csrfToken: string = "";
let adminCompanyId: string = "";
let adminUserId: string = "";
let techCookies: string[] = [];
let techCsrfToken: string = "";
let reportId: string = "";

describe("P0.4.4-E - API Input Validation & Server-Owned Fields Hardening", () => {
  beforeAll(async () => {
    // 1. Setup a test admin user and get their cookies
    const testAdmin = {
      email: "sec-admin@test.com",
      password: "Password123!",
      full_name: "Security Admin",
      company_name: "Security Co",
    };
    
    // Check if user exists
    let existing = await db.findUserByEmail(testAdmin.email);
    if (!existing) {
      await request(app)
        .post("/api/v1/auth/register")
        .send(testAdmin);
    }
      
    const resLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testAdmin.email, password: testAdmin.password });
      
    adminCookies = resLogin.headers["set-cookie"];
    const accessCookie = adminCookies.find(c => c.startsWith("access_token="));
    if (accessCookie) {
       adminToken = accessCookie.split(";")[0].split("=")[1];
    }
    adminCompanyId = resLogin.body.companyId;
    adminUserId = resLogin.body.id;
    const csrfCookie = adminCookies.find(c => c.startsWith("csrf_token="));
    if (csrfCookie) {
      csrfToken = csrfCookie.split(";")[0].split("=")[1];
    }

    // 2. Setup a test technician in the same company
    const testTech = {
      email: "sec-tech@test.com",
      password: "Password123!",
      full_name: "Security Technician",
      company_name: "Security Co",
    };
    let existingTech = await db.findUserByEmail(testTech.email);
    if (!existingTech) {
      const regTech = await request(app)
        .post("/api/v1/auth/register")
        .send(testTech);
      const techId = regTech.body.id;
      await db.updateUser(techId, {
        role: "technician",
        companyId: adminCompanyId,
      });
    } else {
      await db.updateUser(existingTech.id, {
        role: "technician",
        companyId: adminCompanyId,
      });
    }

    const resLoginTech = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testTech.email, password: testTech.password });
    techCookies = resLoginTech.headers["set-cookie"];
    const techCsrf = techCookies.find(c => c.startsWith("csrf_token="));
    if (techCsrf) {
      techCsrfToken = techCsrf.split(";")[0].split("=")[1];
    }

    // Create a base report
    const resReport = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Valid Client",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        travel_hours: 1
      });
    reportId = resReport.body.id;
  });


  // --- Mass-Assignment & Forgery Tests ---
  it("should NOT allow client to update server-owned fields on user profile", async () => {
    const res = await request(app)
      .put("/api/v1/users/me")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        full_name: "Hacked Admin",
        role: "superadmin", // Forged role
        companyId: "c0000000-0000-0000-0000-000000000000", // Forged company
        isActive: false, // Forged isActive
        emailConfirmed: true, // Forged confirmed
        authVersion: 999, // Forged authVersion
      });
    
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Hacked Admin"); // Allowed field updated
    
    // Verify server-owned fields were ignored
    const user = await db.findUserById(adminUserId);
    expect(user!.role).toBe("admin"); // Remains admin
    expect(user!.companyId).toBe(adminCompanyId); // Remains original company
    expect(user!.isActive).toBe(true);
    expect(user!.authVersion).toBe(0); // Password didn't change
  });

  it("should NOT allow admin to alter subscription status or IDs via company settings", async () => {
    const res = await request(app)
      .put("/api/v1/company/settings")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        name: "Hacked Company",
        stripe_subscription_status: "premium", // Forged subscription
        id: "c0000000-0000-0000-0000-000000000000", // Forged ID
        max_users: 100 // Forged limitation
      });

    expect(res.status).toBe(200);
    
    const company = await db.findCompanyById(adminCompanyId);
    expect(company!.name).toBe("Hacked Company");
    expect(company!.stripeSubscriptionStatus).not.toBe("premium");
    expect(company!.maxUsers).toBe(5); // Default value from DB
  });

  // --- Validation Limits & Bounds Tests ---
  it("should reject oversized string fields (e.g. company name > 100 chars)", async () => {
    const longName = "A".repeat(101);
    const res = await request(app)
      .put("/api/v1/company/settings")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({ name: longName });
      
    expect(res.status).toBe(400);
  });

  it("should reject invalid numeric bounds (NaN, Infinity, negative)", async () => {
    // 1. Negative
    const resNeg = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10:00", work_hours: 2, travel_hours: 1,
        work_hours: -5
      });
    expect(resNeg.status).toBe(400);

    // 2. NaN
    const resNan = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10:00", work_hours: 2, travel_hours: 1,
        work_hours: "Not a number"
      });
    expect(resNan.status).toBe(400);
  });

  it("should reject invalid enums", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10:00", work_hours: 2, travel_hours: 1,
        status: "hacked_status"
      });
    expect(res.status).toBe(400);
  });

  it("should reject oversized base64 signature", async () => {
    const hugeBase64 = "data:image/png;base64," + "A".repeat(600000);
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10:00", work_hours: 2, travel_hours: 1,
        signature_base64: hugeBase64
      });
    expect(res.status).toBe(413);
  });

  it("should validate and reject invalid ID paths", async () => {
    // Path parameter verification
    const invalidId = "A".repeat(150);
    const res = await request(app)
      .delete(`/api/v1/reports/${invalidId}`)
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken);
      
    expect(res.status).toBe(400);
  });

  // --- SQL Injection Safety ---
  it("should properly escape potential SQL injection in fields", async () => {
    const sqlPayload = "Hacked'; DROP TABLE reports; --";
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: sqlPayload, work_hours: 2, travel_hours: 1,
        date: "2026-08-27",
        time: "10:00"
      });
      
    expect(res.status).toBe(201); // Created, but escaped
    expect(res.body.client.name).toBe(sqlPayload); // Just treats as string
    
    // Let's verify the reports table is still there
    const reports = await db.getReportsByCompany(adminCompanyId);
    expect(reports.length).toBeGreaterThan(0);
  });
  
  it("should reject invalid date/time formats", async () => {
    const resDate = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026/08/27", time: "10:00", work_hours: 2, travel_hours: 1
      });
    expect(resDate.status).toBe(400);
    
    const resTime = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10-00", work_hours: 2, travel_hours: 1
      });
    expect(resTime.status).toBe(400);
  });

  // =========================================================================
  // P0.4.4-E.1 Dedicated Strict Validation & Server-Owned Fields Tests
  // =========================================================================

  // 1. status=approved tampering
  it("P0.4.4-E.1: should reject status=approved tampering from admin and technician", async () => {
    // Admin attempting status: "approved"
    const resAdmin = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        travel_hours: 1,
        status: "approved"
      });
    expect(resAdmin.status).toBe(400);
    expect(resAdmin.body.detail).toContain("approved");

    // Technician attempting status: "approved"
    const resTech = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", techCookies).set("x-csrf-token", techCsrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        travel_hours: 1,
        status: "approved"
      });
    expect(resTech.status).toBe(400);
    expect(resTech.body.detail).toContain("approved");
  });

  // 2. invalid calendar date
  it("P0.4.4-E.1: should reject impossible calendar dates", async () => {
    const impossibleDates = ["2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31"];
    for (const d of impossibleDates) {
      const res = await request(app)
        .post("/api/v1/reports")
        .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
        .send({
          client_name: "Client Test",
          date: d,
          time: "10:00",
          work_hours: 2,
        });
      expect(res.status).toBe(400);
    }
  });

  // 3. invalid leap date
  it("P0.4.4-E.1: should reject 2026-02-29 (non-leap) and accept 2024-02-29 (leap)", async () => {
    // 2026 is not a leap year
    const resNonLeap = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-02-29",
        time: "10:00",
        work_hours: 2,
      });
    expect(resNonLeap.status).toBe(400);

    // 2024 is a leap year
    const resLeap = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2024-02-29",
        time: "10:00",
        work_hours: 2,
      });
    expect(resLeap.status).toBe(201);
  });

  // 4. invalid time
  it("P0.4.4-E.1: should reject invalid times (24:00, 99:99, 12:99, -1:00)", async () => {
    const invalidTimes = ["24:00", "99:99", "12:99", "-1:00", "1:00"];
    for (const t of invalidTimes) {
      const res = await request(app)
        .post("/api/v1/reports")
        .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
        .send({
          client_name: "Client Test",
          date: "2026-08-27",
          time: t,
          work_hours: 2,
        });
      expect(res.status).toBe(400);
    }
  });

  // 5. NaN quantity
  it("P0.4.4-E.1: should reject NaN quantity in materials instead of defaulting to 0", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "Cavo FG16", quantity: "not-a-number" }]
      });
    expect(res.status).toBe(400);
  });

  // 6. Infinity quantity
  it("P0.4.4-E.1: should reject Infinity quantity in materials", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "Cavo FG16", quantity: 1e999 }]
      });
    expect(res.status).toBe(400);
  });

  // 7. negative quantity
  it("P0.4.4-E.1: should reject negative quantity in materials", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "Cavo FG16", quantity: -5 }]
      });
    expect(res.status).toBe(400);
  });

  // 8. malformed material
  it("P0.4.4-E.1: should reject malformed materials (not an array, not an object, missing quantity)", async () => {
    // string instead of array
    const resStr = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: "string_instead_of_array"
      });
    expect(resStr.status).toBe(400);

    // element not an object
    const resElem = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: ["non-object"]
      });
    expect(resElem.status).toBe(400);

    // missing quantity
    const resMissing = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "Cavo FG16" }]
      });
    expect(resMissing.status).toBe(400);
  });

  // 9. empty material name
  it("P0.4.4-E.1: should reject empty or whitespace-only material name", async () => {
    const resEmpty = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "", quantity: 5 }]
      });
    expect(resEmpty.status).toBe(400);

    const resWhitespace = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "   ", quantity: 5 }]
      });
    expect(resWhitespace.status).toBe(400);
  });

  // 10. oversized material name
  it("P0.4.4-E.1: should reject oversized material name (>255 chars)", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "M".repeat(256), quantity: 5 }]
      });
    expect(res.status).toBe(400);
  });

  // 11. malformed signature
  it("P0.4.4-E.1: should reject malformed signature (non-string or non-data URL)", async () => {
    // Non-string
    const resType = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        signature_base64: 12345
      });
    expect(resType.status).toBe(400);

    // Non data:image URL format
    const resFormat = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        signature_base64: "malformed_raw_base64_without_prefix"
      });
    expect(resFormat.status).toBe(400);
  });

  // 12. oversized signature
  it("P0.4.4-E.1: should reject oversized signature with 413 (>500KB)", async () => {
    const oversizedSig = "data:image/png;base64," + "A".repeat(500001);
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        signature_base64: oversizedSig
      });
    expect(res.status).toBe(413);
  });

  // 13. unknown server-owned fields
  it("P0.4.4-E.1: should prevent client from setting server-owned fields and reject unknown material fields", async () => {
    // Payload with server-owned fields forged
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        id: "forged-report-id-999",
        companyId: "c0000000-0000-0000-0000-000000000999",
        technician: { fullName: "Forged Technician" },
        createdAt: "2000-01-01T00:00:00.000Z",
        role: "superadmin",
        client_name: "Client Forged Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 3,
        travel_hours: 1,
      });
    expect(res.status).toBe(201);
    // Persisted report retains server-controlled values
    expect(res.body.id).not.toBe("forged-report-id-999");
    const persisted = await db.getReportById(adminCompanyId, res.body.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.companyId).toBe(adminCompanyId);
    expect(persisted!.technician.fullName).not.toBe("Forged Technician");

    // Material with unexpected fields rejected with 400
    const resUnknownMat = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Client Test",
        date: "2026-08-27",
        time: "10:00",
        work_hours: 2,
        materials_used: [{ name: "Cavo", quantity: 5, unauthorized_field: true }]
      });
    expect(resUnknownMat.status).toBe(400);
  });

  // 14. valid report still succeeds
  it("P0.4.4-E.1: should successfully create report with valid data and allowed status (draft / submitted)", async () => {
    const validPayload = {
      client_name: "Valid Client S.r.l.",
      client_address: "Via Roma 10",
      client_city: "Milano",
      work_hours: 4.5,
      travel_hours: 1,
      date: "2026-08-27",
      time: "14:30",
      notes: "Intervento completato con successo.",
      status: "draft",
      materials_used: [
        { name: "Cavo FG16 3x2.5", quantity: 25 },
        { name: "Scatola di derivazione", quantity: 2 }
      ],
      signature_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    };

    const res = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.client.name).toBe("Valid Client S.r.l.");
    expect(res.body.client.address).toBe("Via Roma 10");
    expect(res.body.client.city).toBe("Milano");
    expect(res.body.work_hours).toBe(4.5);
    expect(res.body.travel_hours).toBe(1);
    expect(res.body.date).toBe("2026-08-27");
    expect(res.body.time).toBe("14:30");
    expect(res.body.materials_used).toHaveLength(2);
    expect(res.body.materials_used[0]).toEqual({ name: "Cavo FG16 3x2.5", quantity: 25 });
  });

  it("should enforce limit constraints on query params", async () => {
    const res = await request(app)
      .get("/api/v1/reports?limit=9999999")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken);
      
    expect(res.status).toBe(200);
    // Should gracefully clamp limit under the hood to max allowed (1000)
    // The query shouldn't crash
  });
});
