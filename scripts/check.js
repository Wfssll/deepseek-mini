const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
for (const folder of ['src', 'src/ui', 'scripts', 'test']) {
  for (const file of fs.readdirSync(path.join(__dirname, '..', folder))) {
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(__dirname, '..', folder, file)], { stdio: 'inherit' });
  }
}
console.log('JavaScript syntax checks passed.');
