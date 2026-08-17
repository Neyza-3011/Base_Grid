const fs = require("fs");
let content = fs.readFileSync("frontend/src/lib/auth.test.ts", "utf8");

content = content.replace(/headers: \{ Accept: "application\/json" \},\n\s*credentials: "include",\n\s*headers: expect.any\(Object\),/g, 'credentials: "include",\n      headers: expect.any(Object),');

content = content.replace(/headers: \{ "Content-Type": "application\/json" \},\n\s*credentials: "include",\n\s*headers: expect.any\(Object\),/g, 'credentials: "include",\n      headers: expect.any(Object),');

fs.writeFileSync("frontend/src/lib/auth.test.ts", content);
