const fs = require("fs");
let content = fs.readFileSync("frontend/src/lib/reportsStorage.ts", "utf8");

content = 'import { appendCsrfHeaders } from "./auth";\n' + content;

content = content.replace(/headers: \{\s*"Content-Type": "application\/json",\s*\}/g, 'headers: appendCsrfHeaders({ "Content-Type": "application/json" })');
content = content.replace(/method: "DELETE",\s*credentials: "include",\s*headers: \{\}/g, 'method: "DELETE",\n      credentials: "include",\n      headers: appendCsrfHeaders()');

fs.writeFileSync("frontend/src/lib/reportsStorage.ts", content);
