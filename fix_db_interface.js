const fs = require('fs');
let code = fs.readFileSync('server/db-postgres.ts', 'utf8');

// add method to IDatabaseAdapter
code = code.replace('updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;', 'updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;\n  incrementUserAuthVersion(userId: string): Promise<number | null>;');

fs.writeFileSync('server/db-postgres.ts', code);
