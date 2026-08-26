const fs = require('fs');
let code = fs.readFileSync('server/middleware/auth.ts', 'utf8');

const authCheck = `
  if (!user.isActive) {
    res.status(401).json({ detail: "Account disattivato." });
    return;
  }

  const tokenAuthVersion = payload.authVersion ?? 0;
  if (tokenAuthVersion !== user.authVersion) {
    res.status(401).json({ detail: "Sessione invalidata per motivi di sicurezza. Effettua nuovamente l'accesso." });
    return;
  }
`;

code = code.replace(`  if (!user.isActive) {\n    res.status(401).json({ detail: "Account disattivato." });\n    return;\n  }`, authCheck);

// And do the same for optionalAuthenticate
const optAuthCheck = `
    if (user && user.isActive) {
      const tokenAuthVersion = payload.authVersion ?? 0;
      if (tokenAuthVersion === user.authVersion) {
        req.user = user;
        const company = await db.findCompanyById(user.companyId);
        if (company) {
          req.company = company;
        }
      }
    }
`;

code = code.replace(`    if (user && user.isActive) {\n      req.user = user;\n      const company = await db.findCompanyById(user.companyId);\n      if (company) {\n        req.company = company;\n      }\n    }`, optAuthCheck);

fs.writeFileSync('server/middleware/auth.ts', code);
