const fs = require('node:fs');
const path = require('node:path');

const HOME_URL = 'https://chat.deepseek.com/';
const DEFAULTS = { shortcut: 'Command+Space', setupComplete: false, launchAtLogin: false,
  fontSize: 14, window: { width: 672, expandedHeight: 600, x: null, y: null } };

function normalizeAppearance(saved = {}) {
  const geometry = saved.window || {};
  const integer = (value, min, max, fallback) => Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
  return { fontSize: integer(saved.fontSize, 12, 24, 14), window: {
    width: integer(geometry.width, 460, 1800, 672), expandedHeight: integer(geometry.expandedHeight, 320, 1600, 600),
    x: Number.isFinite(geometry.x) ? Math.round(geometry.x) : null,
    y: Number.isFinite(geometry.y) ? Math.round(geometry.y) : null
  } };
}

function fitBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return { width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) };
}

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
      launchAtLogin: saved.launchAtLogin === true, ...normalizeAppearance(saved) };
  } catch { return { ...DEFAULTS, ...normalizeAppearance() }; }
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

module.exports = { HOME_URL, DEFAULTS, normalizeAppearance, fitBounds, isOfficialURL, normalizeShortcut, readSettings, writeSettings, changeShortcut };
