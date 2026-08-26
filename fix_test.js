const fs = require('fs');
let lines = fs.readFileSync('server/auth.test.ts', 'utf8').split('\n');
if (lines[lines.length - 1] === '});' && lines[lines.length - 2] === '  });' && lines[lines.length - 3] === '    });') {
  lines.pop(); // remove the last });
}
fs.writeFileSync('server/auth.test.ts', lines.join('\n'));
