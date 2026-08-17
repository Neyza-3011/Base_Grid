const fs = require("fs");
let content = fs.readFileSync("frontend/src/lib/auth.ts", "utf8");

content = content.replace(/headers: appendCsrfHeaders\(\),\n\s*headers: appendCsrfHeaders\(\{ Accept: "application\/json" \}\),/g, 'headers: appendCsrfHeaders({ Accept: "application/json" }),');
content = content.replace(/headers: appendCsrfHeaders\(\),\n\s*headers: \{ "Content-Type": "application\/json" \},/g, 'headers: appendCsrfHeaders({ "Content-Type": "application/json" }),');

fs.writeFileSync("frontend/src/lib/auth.ts", content);
