const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isOfficialURL, normalizeShortcut, changeShortcut, readSettings, writeSettings, DEFAULTS } = require('../src/core');
test('only the exact official HTTPS origin is trusted', () => {
  assert.equal(isOfficialURL('https://chat.deepseek.com/a/chat/s/abc'), true);
  for (const url of ['http://chat.deepseek.com', 'https://chat.deepseek.com.evil.test', 'file:///tmp/test', 'javascript:alert(1)', 'https://chat.deepseek.com@evil.test']) assert.equal(isOfficialURL(url), false);
});
test('shortcut validation rejects unusable and malformed accelerators', () => {
  for (const shortcut of ['Command+Space', 'Alt+Space', 'Control+Shift+D']) assert.equal(normalizeShortcut(shortcut), shortcut);
  for (const shortcut of ['', 'Space', 'Shift+D', 'Command+Command+D', 'Command+Escape', 'Command+;', null]) assert.throws(() => normalizeShortcut(shortcut));
});
test('a failed replacement retains the previous shortcut', () => {
  const calls = [];
  const api = { register: key => { calls.push(['register', key]); return false; }, unregister: key => calls.push(['unregister', key]), isRegistered: () => true };
  assert.throws(() => changeShortcut(api, 'Alt+Space', 'Command+Space', () => {}), /占用/);
  assert.deepEqual(calls, [['register', 'Command+Space']]);
});
test('a successful replacement unregisters the previous shortcut after registration', () => {
  const calls = [];
  const api = { register: key => { calls.push(['register', key]); return true; }, unregister: key => calls.push(['unregister', key]), isRegistered: () => true };
  assert.equal(changeShortcut(api, 'Alt+Space', 'Command+Space', () => {}), 'Command+Space');
  assert.deepEqual(calls, [['register', 'Command+Space'], ['unregister', 'Alt+Space']]);
});
test('settings survive a restart and corrupted settings return to onboarding', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-settings-'));
  try {
    assert.deepEqual(readSettings(directory), DEFAULTS);
    const settings = { shortcut: 'Alt+Space', setupComplete: true, launchAtLogin: false };
    writeSettings(directory, settings); assert.deepEqual(readSettings(directory), settings);
    assert.equal(fs.statSync(path.join(directory, 'settings.json')).mode & 0o777, 0o600);
    fs.writeFileSync(path.join(directory, 'settings.json'), '{bad');
    assert.deepEqual(readSettings(directory), DEFAULTS);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
