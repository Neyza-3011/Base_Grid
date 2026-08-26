const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');

code = code.replace('      });\n  describe("17. Access Token Revocation', '      });\n    });\n  });\n\n  describe("17. Access Token Revocation');

fs.writeFileSync('server/auth.test.ts', code);
