const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
require('./assets');
async function build() {
  const { packager } = await import('@electron/packager');
  if (process.platform !== 'darwin') throw new Error('This first release currently builds on macOS.');
  const iconset = path.join(root, '.runtime', 'AppIcon.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) for (const retina of [false, true]) {
    const actual = size * (retina ? 2 : 1);
    execFileSync('sips', ['-z', String(actual), String(actual), path.join(root, 'src/assets/icon.png'), '--out', path.join(iconset, `icon_${size}x${size}${retina ? '@2x' : ''}.png`)], { stdio: 'ignore' });
  }
  const icon = path.join(root, '.runtime', 'AppIcon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icon]);
  const output = await packager({ dir: root, name: 'deepseek-fast', platform: 'darwin', arch: process.arch,
    out: path.join(root, 'dist'), overwrite: true, asar: true, prune: true, icon,
    appBundleId: 'io.deepseekmini.app', appCategoryType: 'public.app-category.productivity',
    appVersion: require('../package.json').version,
    extendInfo: { LSUIElement: true, CFBundleGetInfoString: 'deepseek-fast 0.01', NSHumanReadableCopyright: 'MIT · deepseek-fast contributors' },
    ignore: [/^\/\.runtime($|\/)/, /^\/test($|\/)/, /^\/test-output($|\/)/, /^\/scripts($|\/)/, /^\/\.git($|\/)/, /^\/\.github($|\/)/, /^\/docs($|\/)/, /^\/dist($|\/)/]
  });
  console.log(`Built: ${output[0]}/deepseek-fast.app`);
}
build().catch(error => { console.error(error); process.exitCode = 1; });
