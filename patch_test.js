const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');
code = code.replace(
  "expect(deleteRes.status).toBe(404);",
  "expect(deleteRes.status).toBe(404);\n\n      // User A tries to view PDF of Tenant B report\n      const pdfRes = await apiRequest(`/api/v1/reports/${repB.id}/pdf`, {\n        method: \"GET\",\n        cookies: {\n          access_token: tokenA,\n        },\n      });\n      expect(pdfRes.status).toBe(404);"
);
fs.writeFileSync('server/auth.test.ts', code);
