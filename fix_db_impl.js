const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

const newMethod = `
  public async incrementUserAuthVersion(userId: string): Promise<number | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.authVersion = (user.authVersion || 0) + 1;
    user.updatedAt = new Date().toISOString();
    this.users.set(userId, user);
    return user.authVersion;
  }
`;

code = code.replace('public async findUserById', newMethod + '\n  public async findUserById');
fs.writeFileSync('server/db.ts', code);
