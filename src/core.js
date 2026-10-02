const fs = require('node:fs');
const path = require('node:path');

const HOME_URL = 'https://chat.deepseek.com/';
const DEFAULTS = { shortcut: 'Command+Space', setupComplete: false, launchAtLogin: false };

function isOfficialURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'chat.deepseek.com'; }
  catch { return false; }
}

function normalizeShortcut(value) {
  if (typeof value !== 'string' || value.length > 80) throw new Error('请选择有效的快捷键。');
  const tokens = value.split('+');
  const modifiers = ['Command', 'Control', 'Alt', 'Shift', 'Super', 'CommandOrControl'];
  const key = tokens.pop();
  if (!tokens.length || !tokens.some(x => x !== 'Shift') || tokens.some(x => !modifiers.includes(x)) ||
      new Set(tokens).size !== tokens.length || !/^(Space|[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key)) {
    throw new Error('快捷键需包含 ⌘、⌥ 或 ⌃，再加空格、字母或数字。');
  }
  return [...tokens, key].join('+');
}

function readSettings(directory) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'), 'utf8'));
    return { shortcut: normalizeShortcut(saved.shortcut), setupComplete: saved.setupComplete === true,
      launchAtLogin: saved.launchAtLogin === true };
  } catch { return { ...DEFAULTS }; }
}

function writeSettings(directory, settings) {
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'settings.json');
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(settings, null, 2), { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
}

// Register the replacement first so an occupied shortcut never removes the working one.
function changeShortcut(api, previous, next, callback) {
  const normalized = normalizeShortcut(next);
  if (normalized === previous && api.isRegistered(normalized)) return normalized;
  if (!api.register(normalized, callback)) throw new Error('这个快捷键已被系统或其他应用占用。请更换组合，或先关闭 Spotlight 的同名快捷键。');
  if (previous && previous !== normalized) api.unregister(previous);
  return normalized;
}

module.exports = { HOME_URL, DEFAULTS, isOfficialURL, normalizeShortcut, readSettings, writeSettings, changeShortcut };
