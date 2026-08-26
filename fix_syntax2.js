const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');

code = code.replace('        body: { password: "Password123!", current_password: winningPassword },\n      });\n  describe("17. Access Token', '        body: { password: "Password123!", current_password: winningPassword },\n      });\n    });\n  });\n\n  describe("17. Access Token');
fs.writeFileSync('server/auth.test.ts', code);
