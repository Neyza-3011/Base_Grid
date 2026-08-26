const fs = require('fs');
let code = fs.readFileSync('server/auth.test.ts', 'utf8');

// replace all trailing `});`
code = code.replace(/(\}\);\s*)+$/, '');
code += '\n  });\n});\n';

fs.writeFileSync('server/auth.test.ts', code);
