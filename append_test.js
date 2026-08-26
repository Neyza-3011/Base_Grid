const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');

const newTests = `
  describe("17. Access Token Revocation via authVersion (P0.4.4-B)", () => {
    it("invalidates previously issued access tokens upon password change", async () => {
      // 1. login -> access token A
      const loginA = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "admin@rossi.it", password: "Password123!" },
      });
      const accessCookieA = loginA.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const refreshCookieA = loginA.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      const csrfCookieA = loginA.setCookieHeaders.find((c) => c.startsWith("csrf_token="));
      const tokenA = accessCookieA.split(";")[0].split("=")[1];
      const csrfA = csrfCookieA.split(";")[0].split("=")[1];

      // 7. normal authenticated request before security event -> 200
      const meReq1 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfA },
        cookies: { access_token: tokenA, csrf_token: csrfA },
      });
      expect(meReq1.status).toBe(200);

      // 8. user data update senza password -> non invalidare inutilmente la sessione
      const updateData = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": csrfA },
        cookies: { access_token: tokenA, csrf_token: csrfA },
        body: { full_name: "Admin Updated" },
      });
      expect(updateData.status).toBe(200);

      // still 200
      const meReq2 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfA },
        cookies: { access_token: tokenA, csrf_token: csrfA },
      });
      expect(meReq2.status).toBe(200);

      // DEVICE B login -> access token B
      const loginB = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "admin@rossi.it", password: "Password123!" },
      });
      const accessCookieB = loginB.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const csrfCookieB = loginB.setCookieHeaders.find((c) => c.startsWith("csrf_token="));
      const tokenB = accessCookieB.split(";")[0].split("=")[1];
      const csrfB = csrfCookieB.split(";")[0].split("=")[1];

      // 2. password change (on DEVICE A)
      const changePass = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": csrfA },
        cookies: { access_token: tokenA, csrf_token: csrfA },
        body: { password: "NewStrongPassword2026_Secure!", current_password: "Password123!" },
      });
      expect(changePass.status).toBe(200);

      // 3. old access token -> 401 (Device A token)
      const meReq3 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfA },
        cookies: { access_token: tokenA, csrf_token: csrfA },
      });
      expect(meReq3.status).toBe(401);

      // Device B old token -> 401
      const meReq4 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfB },
        cookies: { access_token: tokenB, csrf_token: csrfB },
      });
      expect(meReq4.status).toBe(401);

      // 4. old refresh token -> rejected
      const refreshReq = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "x-csrf-token": csrfA },
        cookies: { refresh_token: refreshCookieA.split(";")[0].split("=")[1], csrf_token: csrfA },
      });
      expect(refreshReq.status).toBe(401);

      // 5. new login -> valid new access token
      const loginC = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "admin@rossi.it", password: "NewStrongPassword2026_Secure!" },
      });
      expect(loginC.status).toBe(200);
      const accessCookieC = loginC.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const csrfCookieC = loginC.setCookieHeaders.find((c) => c.startsWith("csrf_token="));
      const tokenC = accessCookieC.split(";")[0].split("=")[1];
      const csrfC = csrfCookieC.split(";")[0].split("=")[1];

      const meReq5 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfC },
        cookies: { access_token: tokenC, csrf_token: csrfC },
      });
      expect(meReq5.status).toBe(200);

      // 9. authVersion non modificabile dal client
      const hackerUpdate = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": csrfC },
        cookies: { access_token: tokenC, csrf_token: csrfC },
        body: { authVersion: 999 },
      });
      expect(hackerUpdate.status).toBe(200);
      
      // Token C should still work (authVersion wasn't actually changed in DB)
      const meReq6 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfC },
        cookies: { access_token: tokenC, csrf_token: csrfC },
      });
      expect(meReq6.status).toBe(200);
      
      // 6. authVersion mismatch -> 401
      // We manually construct a valid token but with wrong authVersion
      const user = await import("./db").then(m => m.db.findUserByEmail("admin@rossi.it"));
      const security = await import("./security");
      const badPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        tokenType: "access",
        jti: "fake-jti",
        authVersion: 999, // mismatched
      };
      const badToken = await import("jsonwebtoken").then(m => m.sign(badPayload, security.getJwtSecret()));
      
      const meReq7 = await apiRequest("/api/v1/users/me", {
        method: "GET",
        headers: { "x-csrf-token": csrfC },
        cookies: { access_token: badToken, csrf_token: csrfC },
      });
      expect(meReq7.status).toBe(401);
    });
  });
});
`;

code = code.replace(/    \}\);\n  \}\);\n\}\);\s*$/, newTests);
// Or if there are only two brackets at the end:
if (!code.includes(newTests)) {
  code = code.replace(/    \}\);\n  \}\);\s*$/, newTests);
}
if (!code.includes(newTests)) {
  code += '\n' + newTests;
}

fs.writeFileSync('server/auth.test.ts', code);
