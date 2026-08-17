const fs = require("fs");
let content = fs.readFileSync("frontend/src/components/dashboard/ProfileSettings.tsx", "utf8");

content = content.replace(/headers: appendCsrfHeaders\(\{\s*"Content-Type": "application\/json",\s*\}\),\s*\},/g, 'headers: appendCsrfHeaders({\n            "Content-Type": "application/json",\n          }),');

fs.writeFileSync("frontend/src/components/dashboard/ProfileSettings.tsx", content);
