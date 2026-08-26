const fs = require('fs');
let content = fs.readFileSync('server/auth.test.ts', 'utf8');

const concurrentTest = `
    it("handles concurrent password changes securely", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "tech@rossi.it", password: "Password123!" },
      });
      const accessCookie = loginRes.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const csrfCookie = loginRes.setCookieHeaders.find((c) => c.startsWith("csrf_token="));
      const accessToken = accessCookie.split(";")[0].split("=")[1];
      const csrfToken = csrfCookie.split(";")[0].split("=")[1];

      // Two concurrent requests
      const req1 = apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": csrfToken },
        cookies: { access_token: accessToken, csrf_token: csrfToken },
        body: { password: "ConcurrentPassword1!", current_password: "Password123!" },
      });

      const req2 = apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": csrfToken },
        cookies: { access_token: accessToken, csrf_token: csrfToken },
        body: { password: "ConcurrentPassword2!", current_password: "Password123!" },
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      
      // One should succeed, the other might fail with 401 if it hits DB after the first updated it,
      // or both might succeed if they evaluate verifyPassword before either writes,
      // BUT if one succeeds and writes, at least one of the new passwords must be valid.
      // Wait, since both might read the same current_password hash before either updates, 
      // both might pass the verifyPassword check. Then both might revoke and update.
      // The final state must be consistent: one of the passwords wins, and sessions are revoked.
      
      const successCount = (res1.status === 200 ? 1 : 0) + (res2.status === 200 ? 1 : 0);
      expect(successCount).toBeGreaterThan(0);

      // Verify sessions are revoked (we can just verify we need one of the new passwords to login)
      let login1 = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "tech@rossi.it", password: "ConcurrentPassword1!" },
      });
      let login2 = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: { email: "tech@rossi.it", password: "ConcurrentPassword2!" },
      });

      const loginSuccessCount = (login1.status === 200 ? 1 : 0) + (login2.status === 200 ? 1 : 0);
      expect(loginSuccessCount).toBe(1); // Exactly one password should win
      
      // Reset password for other tests
      const winningPassword = login1.status === 200 ? "ConcurrentPassword1!" : "ConcurrentPassword2!";
      const winningToken = (login1.status === 200 ? login1 : login2).setCookieHeaders.find(c => c.startsWith("access_token=")).split(";")[0].split("=")[1];
      const winningCsrf = (login1.status === 200 ? login1 : login2).setCookieHeaders.find(c => c.startsWith("csrf_token=")).split(";")[0].split("=")[1];
      
      await apiRequest("/api/v1/users/me", {
        method: "PUT",
        headers: { "x-csrf-token": winningCsrf },
        cookies: { access_token: winningToken, csrf_token: winningCsrf },
        body: { password: "Password123!", current_password: winningPassword },
      });
    });
`;

content = content.replace('  });\n});', concurrentTest + '  });\n});');
fs.writeFileSync('server/auth.test.ts', content);
