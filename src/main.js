const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, dialog, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { HOME_URL, readSettings, writeSettings, changeShortcut, isOfficialURL, normalizeAppearance, fitBounds } = require('./core');
const { websiteOperation } = require('./adapter');

const demo = process.argv.includes('--demo');
const smoke = process.argv.includes('--smoke-test');
const fixture = demo || smoke;
app.setName('deepseek-mini');
// Preserve the original prototype's browser session and settings on upgrade.
if (app.isPackaged && process.platform === 'darwin') app.setPath('userData', path.join(app.getPath('appData'), 'DeepSeek Mini'));
if (!app.isPackaged) app.setPath('userData', path.join(__dirname, '..', '.runtime', fixture ? 'demo-profile' : 'profile'));
if (smoke) app.setPath('userData', path.join(__dirname, '..', '.runtime', `smoke-${process.pid}`));
const acquired = app.requestSingleInstanceLock({ demo: fixture });
if (!acquired) app.quit();

let miniWindow, website, tray, timer, saveTimer;
let layout = { view: 'setup', expanded: false, compactHeight: 150, setupHeight: 650 };
let resizeOrigin;
let quitting = false;
let registered = null;
let settings;
let polling = false;
let sending = false;
let awaiting = null;
let view = 'setup';
let websiteState = { status: 'loading', hasComposer: false, think: null, search: null, generating: false };
let answerHTML = '';
let prompt = '';
let attachments = [];
let notice = '';
const localPage = path.join(__dirname, 'ui', 'index.html');
const homeURL = fixture ? pathToFileURL(path.join(__dirname, '..', 'test', 'website.html')).href : HOME_URL;

function state() {
  return { settings, shortcutRegistered: !!registered, view, demo: fixture, website: websiteState,
    answerHTML, prompt, attachments, awaiting: !!awaiting, notice };
}

function publish() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('mini:state', state());
}

function trusted(event) {
  return event.sender === miniWindow?.webContents && event.senderFrame === event.sender.mainFrame &&
    event.senderFrame.url === pathToFileURL(localPage).href;
}

function handle(name, callback) {
  ipcMain.handle(`mini:${name}`, async (event, value) => {
    if (!trusted(event)) throw new Error('此请求不来自小窗。');
    try { return { ok: true, value: await callback(value) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

async function remote(operation, argument) {
  if (!website || website.isDestroyed()) throw new Error('官网窗口不可用，请重启应用。');
  const url = website.webContents.getURL();
  if (!isOfficialURL(url) && !(fixture && url === homeURL)) throw new Error('请等待 DeepSeek 官方网页加载完成。');
  return website.webContents.executeJavaScript(`(${websiteOperation.toString()})(${JSON.stringify(operation)},${JSON.stringify(argument ?? null)})`, true);
}

async function poll() {
  if (polling || !website || website.isDestroyed() || website.webContents.isLoadingMainFrame()) return;
  polling = true;
  try {
    const next = await remote('snapshot');
    websiteState = next;
    if (awaiting && (next.html !== awaiting.html || next.answerCount > awaiting.answerCount) && next.html) {
      answerHTML = next.html;
      awaiting = null;
      attachments = [];
      notice = '';
    } else if (!awaiting && answerHTML && next.html) answerHTML = next.html;
    if (awaiting && Date.now() - awaiting.started > 45000) notice = '官网还未返回回答。可打开完整官网查看进度或错误提示。';
    if (next.errors) notice = next.errors;
    publish();
  } catch { /* During navigation, wait for the next finished document. */ }
  finally { polling = false; }
}

function rememberBounds() {
  const bounds = miniWindow.getBounds();
  settings.window = { ...settings.window, x: bounds.x, y: bounds.y, width: bounds.width,
    ...(layout.view === 'chat' && layout.expanded ? { expandedHeight: bounds.height } : {}) };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeSettings(app.getPath('userData'), settings), 250);
}

function resize(value) {
  if (!value || !['chat', 'setup', 'settings'].includes(value.view)) return;
  layout = { view: value.view, expanded: value.expanded === true,
    compactHeight: Math.max(140, Math.min(450, Number(value.compactHeight) || 150)),
    setupHeight: Math.max(500, Math.min(1000, Number(value.setupHeight) || 650)) };
  const bounds = miniWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const minimum = layout.view !== 'chat' ? 500 : layout.expanded ? Math.max(320, layout.compactHeight + 150) : layout.compactHeight;
  const height = layout.view !== 'chat' ? layout.setupHeight : layout.expanded ? Math.max(minimum, settings.window.expandedHeight) : layout.compactHeight;
  miniWindow.setMinimumSize(460, Math.min(minimum, area.height));
  miniWindow.setBounds(fitBounds({ ...bounds, height }, area));
}

function resizeDrag(value) {
  if (value?.phase === 'start' && ['n','s','e','w','ne','nw','se','sw'].includes(value.edge)) {
    resizeOrigin = { ...miniWindow.getBounds(), edge: value.edge }; return;
  }
  if (value?.phase === 'end') { resizeOrigin = null; return; }
  if (!resizeOrigin || !Number.isFinite(value?.dx) || !Number.isFinite(value?.dy)) return;
  const origin = resizeOrigin;
  const edge = origin.edge;
  const [minWidth, minHeight] = miniWindow.getMinimumSize();
  const width = Math.max(minWidth, Math.min(1800, origin.width + (edge.includes('w') ? -value.dx : edge.includes('e') ? value.dx : 0)));
  const height = layout.expanded || layout.view !== 'chat' ? Math.max(minHeight, Math.min(1600, origin.height + (edge.includes('n') ? -value.dy : edge.includes('s') ? value.dy : 0))) : origin.height;
  const bounds = { x: origin.x + (edge.includes('w') ? origin.width - width : 0),
    y: origin.y + (edge.includes('n') ? origin.height - height : 0), width, height };
  miniWindow.setBounds(fitBounds(bounds, screen.getDisplayMatching(bounds).workArea));
}

function showMini(nextView) {
  if (nextView) view = nextView;
  if (process.platform === 'darwin') app.dock.hide();
  const bounds = miniWindow.getBounds();
  miniWindow.setBounds(fitBounds(bounds, screen.getDisplayMatching(bounds).workArea));
  publish();
  miniWindow.show();
  miniWindow.focus();
}

function toggle() {
  if (miniWindow.isVisible()) miniWindow.hide();
  else showMini(settings.setupComplete ? 'chat' : 'setup');
}

function openWebsite() {
  if (process.platform === 'darwin') app.dock.show();
  website.show(); website.focus();
}

function makeTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assets', 'tray.png')).toString('base64'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('deepseek-mini');
  updateTray();
}

function updateTray() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: `显示 / 隐藏小窗${registered ? `  (${registered})` : ''}`, click: toggle },
    { label: '打开 DeepSeek 官网 / 登录', click: openWebsite },
    { label: '新对话', click: () => { newChat().catch(error => { notice = error.message; publish(); }); showMini('chat'); } },
    { type: 'separator' },
    { label: '设置快捷键与字号…', click: () => showMini('settings') },
    { label: '重新加载官网', click: () => website.webContents.reload() },
    { type: 'separator' },
    { label: '退出 deepseek-mini', click: () => { quitting = true; app.quit(); } }
  ]));
}

async function newChat() {
  if (websiteState.generating || awaiting) throw new Error('请先在官网停止当前回答，再创建新对话。');
  answerHTML = ''; prompt = ''; attachments = []; notice = '';
  websiteState = { status: 'loading', hasComposer: false, think: null, search: null };
  publish();
  await website.loadURL(homeURL);
}

async function attach() {
  if (awaiting || sending || websiteState.generating) throw new Error('请等待当前回答。');
  if (!await remote('file-input')) throw new Error('未找到官网的文件上传入口，请打开完整官网上传。');
  const choice = await dialog.showOpenDialog(miniWindow, { title: '添加文件到 DeepSeek', properties: ['openFile', 'multiSelections'] });
  if (choice.canceled || !choice.filePaths.length) return [];
  const contents = website.webContents;
  try {
    contents.debugger.attach('1.3');
    const { root } = await contents.debugger.sendCommand('DOM.getDocument');
    const { nodeId } = await contents.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type="file"]' });
    if (!nodeId) throw new Error('官网文件入口已改变，请在完整官网添加文件。');
    await contents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: choice.filePaths });
  } finally { if (contents.debugger.isAttached()) contents.debugger.detach(); }
  attachments = choice.filePaths.map(file => path.basename(file));
  notice = '文件已交给官网。请等待文件解析；必要时打开官网查看上传状态。';
  publish();
  return attachments;
}

function configureHandlers() {
  handle('state', state);
  handle('hide', () => miniWindow.hide());
  handle('login', openWebsite);
  handle('settings', () => { view = 'settings'; publish(); });
  handle('resize', resize);
  handle('resize-drag', resizeDrag);
  handle('appearance', value => {
    const fontSize = normalizeAppearance(value).fontSize;
    settings = { ...settings, fontSize };
    writeSettings(app.getPath('userData'), settings); publish(); return fontSize;
  });
  handle('setup', async value => {
    if (!value || typeof value !== 'object') throw new Error('设置无效。');
    await poll();
    if (!websiteState.hasComposer && !settings.setupComplete) throw new Error('请先在官网完成登录，等到输入框可用后再继续。');
    const previous = registered;
    const next = changeShortcut(globalShortcut, registered, value.shortcut, toggle);
    const saved = { ...settings, shortcut: next, setupComplete: true, launchAtLogin: value.launchAtLogin === true };
    try {
      writeSettings(app.getPath('userData'), saved);
    } catch (error) {
      if (next !== previous) { globalShortcut.unregister(next); if (previous) globalShortcut.register(previous, toggle); }
      throw new Error(`无法保存设置：${error.message}`);
    }
    registered = next; settings = saved;
    if (app.isPackaged && process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin, openAsHidden: true });
    view = 'chat'; notice = ''; updateTray(); publish();
    return state();
  });
  handle('send', async text => {
    if (typeof text !== 'string' || !text.trim() || text.length > 100000) throw new Error('请输入问题（最长 100,000 字符）。');
    if (sending || awaiting || websiteState.generating) throw new Error('DeepSeek 正在处理当前问题，请稍候。');
    if (!settings.setupComplete && !smoke) throw new Error('请先完成登录和快捷键设置。');
    sending = true;
    try {
      const baseline = await remote('fill', text);
      await new Promise(resolve => setTimeout(resolve, 100));
      await remote('submit');
      let accepted = false;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (await remote('accepted', text)) { accepted = true; break; }
        const status = await remote('snapshot');
        if (status.errors) throw new Error(status.errors);
      }
      if (!accepted) throw new Error('官网尚未确认接收。问题已保留；请打开官网查看文件解析或网络状态，再决定是否发送。');
      prompt = text; answerHTML = ''; notice = '';
      awaiting = { ...baseline, started: Date.now() };
      publish();
      return true;
    } finally { sending = false; }
  });
  handle('mode', async name => {
    if (sending || awaiting || websiteState.generating) throw new Error('请等待当前回答结束。');
    await remote('mode', name);
    await new Promise(resolve => setTimeout(resolve, 80));
    await poll();
    return websiteState;
  });
  handle('attach', attach);
  handle('stop', async () => { await remote('stop'); awaiting = null; await poll(); });
  handle('new-chat', newChat);
  handle('reload', async () => { awaiting = null; websiteState.status = 'loading'; notice = ''; publish(); website.webContents.reload(); });
  handle('spotlight', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.keyboard?Shortcuts'));
  handle('external', url => {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('仅支持打开网页链接。');
    return shell.openExternal(parsed.href);
  });
  handle('copy', text => { if (typeof text === 'string' && text.length < 1000000) clipboard.writeText(text); });
}

function createWindows() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const saved = settings.window;
  const initial = fitBounds({ width: saved.width, height: 650,
    x: saved.x ?? Math.round(area.x + (area.width - saved.width) / 2),
    y: saved.y ?? Math.round(area.y + Math.min(180, area.height * 0.2)) },
    screen.getDisplayMatching({ x: saved.x ?? area.x, y: saved.y ?? area.y, width: saved.width, height: 650 }).workArea);
  miniWindow = new BrowserWindow({ ...initial, minWidth: 460, minHeight: 140, frame: false, transparent: true, hasShadow: true,
    resizable: true, maximizable: false, minimizable: false, show: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  miniWindow.on('move', rememberBounds);
  miniWindow.on('resize', rememberBounds);
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  miniWindow.webContents.on('will-navigate', event => event.preventDefault());
  miniWindow.on('close', event => { if (!quitting) { event.preventDefault(); miniWindow.hide(); } });

  website = new BrowserWindow({ width: 1060, height: 780, minWidth: 720, minHeight: 500, show: false,
    title: fixture ? 'deepseek-mini · 离线演示网页' : 'DeepSeek · 官方网页登录',
    webPreferences: { partition: 'persist:deepseek', nodeIntegration: false, contextIsolation: true,
      sandbox: true, backgroundThrottling: false, spellcheck: false } });
  // Use an ordinary Chromium UA. No request interception or private API is involved.
  website.webContents.setUserAgent(website.webContents.getUserAgent().replace(/ DeepSeekMini\/\S+| Electron\/\S+/g, ''));
  website.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  website.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  website.webContents.on('will-navigate', (event, url) => {
    if (!isOfficialURL(url) && !(fixture && url === homeURL)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  website.webContents.on('did-finish-load', () => { poll(); });
  website.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    websiteState = { status: 'offline', hasComposer: false, think: null, search: null };
    notice = `官网加载失败（${description}）。请检查网络后重新连接。`; publish();
  });
  website.webContents.on('render-process-gone', () => {
    websiteState = { status: 'offline', hasComposer: false }; notice = '官网页面已停止运行，请重新连接。'; publish();
  });
  website.on('close', event => { if (!quitting) { event.preventDefault(); website.hide(); if (process.platform === 'darwin') app.dock.hide(); } });
  website.loadURL(homeURL).catch(() => {});
  miniWindow.loadFile(localPage);
  miniWindow.once('ready-to-show', () => { if (!settings.setupComplete || notice || fixture) showMini(view); });
}

async function smokeTest() {
  const output = path.join(__dirname, '..', 'test-output');
  fs.mkdirSync(output, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  await delay(1500);
  await poll();
  if (!websiteState.hasComposer) throw new Error('Fixture composer did not load');
  fs.writeFileSync(path.join(output, 'setup.png'), (await miniWindow.webContents.capturePage()).toPNG());
  settings.setupComplete = true;
  view = 'chat'; publish();
  await delay(400);
  fs.writeFileSync(path.join(output, 'compact.png'), (await miniWindow.webContents.capturePage()).toPNG());
  const invoke = script => miniWindow.webContents.executeJavaScript(script, true);
  const result = await invoke("window.mini.send('请介绍一下 deepseek-mini 的使用方式')");
  if (!result.ok) throw new Error(result.error);
  await delay(3500); await poll();
  if (!answerHTML.includes('快捷键')) throw new Error('Website answer was not synchronized');
  await delay(300);
  fs.writeFileSync(path.join(output, 'answer.png'), (await miniWindow.webContents.capturePage()).toPNG());
  const toggled = await invoke("window.mini.mode('think')");
  if (!toggled.ok || toggled.value.think !== true) throw new Error('DeepThink did not toggle');
  const invalid = await website.webContents.executeJavaScript("typeof window.mini === 'undefined'");
  if (!invalid) throw new Error('Privileged bridge leaked into the remote page');
  if (await website.webContents.executeJavaScript('window.sendCount') !== 1) throw new Error('Submission was duplicated');
  const resized = await invoke("window.mini.resizeDrag({phase:'start',edge:'se'}).then(()=>window.mini.resizeDrag({dx:100,dy:90})).then(()=>window.mini.resizeDrag({phase:'end'}))");
  if (!resized.ok) throw new Error(resized.error);
  const remembered = miniWindow.getBounds();
  miniWindow.setPosition(remembered.x - 20, remembered.y - 10);
  await delay(1000); await poll();
  const stable = miniWindow.getBounds();
  if (stable.width !== remembered.width || stable.height !== remembered.height) throw new Error('Streaming overwrote window dimensions');
  const font = await invoke("window.mini.appearance({fontSize:20})");
  if (!font.ok) throw new Error(font.error);
  await delay(400);
  if (await invoke("getComputedStyle(document.getElementById('answer')).fontSize") !== '20px') throw new Error('Font setting did not apply');
  const saved = readSettings(app.getPath('userData'));
  if (saved.fontSize !== 20 || saved.window.width !== stable.width || saved.window.expandedHeight !== stable.height) throw new Error('Appearance was not persisted');
  fs.writeFileSync(path.join(output, 'resized.png'), (await miniWindow.webContents.capturePage()).toPNG());
  toggle(); if (miniWindow.isVisible()) throw new Error('Hide failed');
  toggle(); if (!miniWindow.isVisible()) throw new Error('Show failed');
  if (JSON.stringify(miniWindow.getBounds()) !== JSON.stringify(stable)) throw new Error('Show moved the remembered window');
  fs.writeFileSync(path.join(output, 'smoke.json'), JSON.stringify({ passed: true, checks: ['onboarding', 'compact composer', 'official-page-shaped send and streaming', 'mode toggle', 'remote isolation', 'hide/show', 'delayed acknowledgement without duplicate send', 'edge resize preserved during polling', 'position memory', 'font change and settings persistence'] }, null, 2));
  console.log('Smoke test passed. Screenshots: test-output/');
  quitting = true; app.quit();
}

if (acquired) {
  app.on('second-instance', () => { if (miniWindow) showMini(settings.setupComplete ? 'chat' : 'setup'); });
  app.whenReady().then(() => {
    settings = readSettings(app.getPath('userData'));
    view = settings.setupComplete ? 'chat' : 'setup';
    if (settings.setupComplete && !fixture) {
      try { registered = changeShortcut(globalShortcut, null, settings.shortcut, toggle); }
      catch (error) { notice = error.message; view = 'settings'; }
    }
    configureHandlers(); createWindows(); makeTray();
    if (process.platform === 'darwin') app.dock.hide();
    if (app.isPackaged && process.platform === 'darwin' && settings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'deepseek-mini', submenu: [
      { label: '设置…', accelerator: 'CommandOrControl+,', click: () => showMini('settings') },
      { role: 'quit', label: '退出' }
    ] }, { role: 'editMenu', label: '编辑' }]));
    timer = setInterval(poll, 700);
    if (smoke) smokeTest().catch(error => { console.error(error); quitting = true; app.exit(1); });
  });
  app.on('activate', () => { if (miniWindow) showMini(settings.setupComplete ? 'chat' : 'setup'); });
  app.on('window-all-closed', event => { /* A tray application stays alive. */ });
  app.on('before-quit', () => { quitting = true; clearInterval(timer); clearTimeout(saveTimer); if (settings) writeSettings(app.getPath('userData'), settings); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
