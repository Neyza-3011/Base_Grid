const fs = require("fs");
let content = fs.readFileSync("frontend/src/components/dashboard/CompanySettings.tsx", "utf8");

content = 'import { appendCsrfHeaders } from "../../lib/auth";\n' + content;
content = content.replace(/headers: \{\s*"Content-Type": "application\/json",\s*\}/g, 'headers: appendCsrfHeaders({ "Content-Type": "application/json" })');

fs.writeFileSync("frontend/src/components/dashboard/CompanySettings.tsx", content);
