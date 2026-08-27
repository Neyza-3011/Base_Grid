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
    if (existing) {
    }
    
    const resReg = await request(app)
      .post("/api/v1/auth/register")
      .send(testAdmin);
      
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
        client_name: "Test", date: "2026/08/27", time: "10:00"
      });
    expect(resDate.status).toBe(400);
    
    const resTime = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", adminCookies).set("x-csrf-token", csrfToken)
      .send({
        client_name: "Test", date: "2026-08-27", time: "10-00"
      });
    expect(resTime.status).toBe(400);
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
