const fs = require('fs');
let code = fs.readFileSync('server/routes/users.ts', 'utf8');

const updated = `
    const updatedUser = await db.updateUser(req.user.id, updates);
    if (!updatedUser) {
      res.status(500).json({ detail: "Impossibile aggiornare il profilo." });
      return;
    }

    if (password && typeof password === "string") {
      await db.incrementUserAuthVersion(req.user.id);
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/api/v1/auth" });
      res.clearCookie("csrf_token", { path: "/" });
    }
`;

code = code.replace(`    const updatedUser = await db.updateUser(req.user.id, updates);\n    if (!updatedUser) {\n      res.status(500).json({ detail: "Impossibile aggiornare il profilo." });\n      return;\n    }\n\n    if (password && typeof password === "string") {\n      res.clearCookie("access_token", { path: "/" });\n      res.clearCookie("refresh_token", { path: "/api/v1/auth" });\n      res.clearCookie("csrf_token", { path: "/" });\n    }`, updated);

fs.writeFileSync('server/routes/users.ts', code);
