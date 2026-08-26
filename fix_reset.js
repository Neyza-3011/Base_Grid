const fs = require('fs');
let code = fs.readFileSync('server/routes/auth.ts', 'utf8');

const updated = `
    await tokenStore.revokeAllUserTokens(tokenRecord.userId);

    // Increment authVersion to invalidate existing access tokens globally
    await db.incrementUserAuthVersion(tokenRecord.userId);

    // 4. Update user's password and consume reset token in DB
`;

code = code.replace(`    await tokenStore.revokeAllUserTokens(tokenRecord.userId);\n\n    // 4. Update user's password and consume reset token in DB`, updated);

fs.writeFileSync('server/routes/auth.ts', code);
