const fs = require('fs');
let code = fs.readFileSync('server/routes/users.ts', 'utf8');
code = code.replace(/usersRouter\.put\("\/me", authenticate, \(req: any, res: any\): void => {/g, 'usersRouter.put("/me", authenticate, async (req: any, res: any): Promise<void> => {');
fs.writeFileSync('server/routes/users.ts', code);
