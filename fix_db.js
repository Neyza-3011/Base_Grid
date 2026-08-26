const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

// The issue was we replaced all `updatedAt: now,` with `updatedAt: now,\n      authVersion: 0,`
// Let's replace `\n      authVersion: 0,` with empty string only for CompanyRecord. Wait, just write a smarter replace or regex.
// Since I already modified it, I'll remove all authVersion: 0, and re-add it only in UserRecord creations.
code = code.replace(/      authVersion: 0,\n/g, '');

// Now inject authVersion: 0 for users
// Find "const superAdminUser: UserRecord =" ...
const userRegex = /(const \w+User|const newUser): UserRecord = {([\s\S]*?)updatedAt: (now|new Date\(\)\.toISOString\(\)),/g;
code = code.replace(userRegex, (match, p1, p2, p3) => {
  return `${match}\n      authVersion: 0,`;
});

fs.writeFileSync('server/db.ts', code);
