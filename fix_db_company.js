const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

code = code.replace('    this.companies.set(id, updated);\n \n  }', '    this.companies.set(id, updated);\n    return updated;\n  }');
fs.writeFileSync('server/db.ts', code);
