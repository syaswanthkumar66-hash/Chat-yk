const fs = require('fs');
const lines = fs.readFileSync('server/index.ts', 'utf8').split('\n');

for (let i = 2170; i < 2210; i++) {
  if (lines[i] && lines[i].includes('])')) {
    if (lines[i+1] && lines[i+1].includes(']')) {
      if (lines[i+2] && lines[i+2].includes('});')) {
        // Change lines[i+1] from `      ]` to `      ])`
        lines[i+1] = lines[i+1].replace(']', '])');
        fs.writeFileSync('server/index.ts', lines.join('\n'));
        console.log('Patched');
        break;
      }
    }
  }
}
