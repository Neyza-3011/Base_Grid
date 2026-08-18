const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

const patches = [
  { search: 'return user || null;\n\n  public async', replace: 'return user || null;\n  }\n\n  public async' },
  { search: 'return null;\n\n  public async', replace: 'return null;\n  }\n\n  public async' },
  { search: 'return { user: newUser, company: newCompany };\n\n  public async', replace: 'return { user: newUser, company: newCompany };\n  }\n\n  public async' },
  { search: 'return updated;\n\n  // --- Company', replace: 'return updated;\n  }\n\n  // --- Company' },
  { search: 'return this.companies.get(id) || null;\n\n  public async', replace: 'return this.companies.get(id) || null;\n  }\n\n  public async' },
  { search: 'return updated;\n\n  public async', replace: 'return updated;\n  }\n\n  public async' },
  { search: 'return Array.from(this.companies.values());\n\n  // --- Reports', replace: 'return Array.from(this.companies.values());\n  }\n\n  // --- Reports' },
  { search: 'return list.slice(0, limit);\n\n  public async', replace: 'return list.slice(0, limit);\n  }\n\n  public async' },
  { search: 'return newReport;\n\n  public async', replace: 'return newReport;\n  }\n\n  public async' },
];

patches.forEach(p => {
  code = code.replace(p.search, p.replace);
});

fs.writeFileSync('server/db.ts', code);
