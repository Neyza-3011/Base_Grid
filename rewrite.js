const fs = require('fs');
let content = fs.readFileSync('server/db.ts', 'utf8');

// The original file is messed up because of my seds.
// Let's just fix the brackets.

content = content.replace(/  \}\n\n  public async/g, '  public async');
content = content.replace(/  \}\n  \/\/ ---/g, '  // ---');
content = content.replace(/  \/\/ --- Users Operations ---\n  \}/g, '  // --- Users Operations ---');
content = content.replace(/  \/\/ --- Superadmin Stats ---\n  \}/g, '  // --- Superadmin Stats ---');
content = content.replace(/  \/\/ --- Company Operations ---\n  \}/g, '  // --- Company Operations ---');
content = content.replace(/  \/\/ --- Reports Operations \(Strict Tenant Isolation\) ---\n  \}/g, '  // --- Reports Operations (Strict Tenant Isolation) ---');

fs.writeFileSync('server/db.ts', content);
