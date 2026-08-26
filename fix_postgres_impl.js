const fs = require('fs');
let code = fs.readFileSync('server/db-postgres.ts', 'utf8');

const newMethod = `
  public async incrementUserAuthVersion(userId: string): Promise<number | null> {
    try {
      const res = await pool.query(
        'UPDATE users SET "authVersion" = "authVersion" + 1, "updatedAt" = $1 WHERE id = $2 RETURNING "authVersion"',
        [new Date().toISOString(), userId]
      );
      if (res.rowCount === 0) return null;
      return res.rows[0].authVersion;
    } catch (err) {
      console.error("[PostgresAdapter] Error incrementing authVersion:", err);
      throw err;
    }
  }
`;

code = code.replace('public async findUserById', newMethod + '\n  public async findUserById');
fs.writeFileSync('server/db-postgres.ts', code);
