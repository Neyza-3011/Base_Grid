const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');

const testCode = `
  describe("15. CSRF Protection Security Suite (P0.4.1)", () => {
    it("rejects mutating request when CSRF header is missing", async () => {
      const user = await db.findUserByEmail("admin@rossi.it");
      const { accessToken } = generateTokens(user);
      
      const res = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        cookies: {
          access_token: accessToken,
          csrf_token: "test-csrf-cookie",
        },
        body: { full_name: "Test Hacker" },
      });
      
      expect(res.status).toBe(403);
      expect(res.body.detail).toMatch(/CSRF token mancante o non valido/);
    });

    it("rejects mutating request when CSRF header does not match CSRF cookie", async () => {
      const user = await db.findUserByEmail("admin@rossi.it");
      const { accessToken } = generateTokens(user);
      
      const res = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": "wrong-csrf-value" },
        cookies: {
          access_token: accessToken,
          csrf_token: "test-csrf-cookie",
        },
        body: { full_name: "Test Hacker" },
      });
      
      expect(res.status).toBe(403);
      expect(res.body.detail).toMatch(/CSRF token mancante o non valido/);
    });

    it("accepts mutating request when CSRF header matches CSRF cookie", async () => {
      const user = await db.findUserByEmail("admin@rossi.it");
      const { accessToken } = generateTokens(user);
      const testCsrf = "valid-test-csrf";
      
      const res = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": testCsrf },
        cookies: {
          access_token: accessToken,
          csrf_token: testCsrf,
        },
        body: { full_name: "Valid Edit" },
      });
      
      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Valid Edit");
    });
  });
`;

code = code.replace(
  "});\nEOF",
  "});\n" + testCode + "\nEOF"
);
// In case EOF wasn't matched exactly
if (!code.includes("15. CSRF Protection Security Suite")) {
   code += testCode;
}

fs.writeFileSync('server/auth.test.ts', code);
