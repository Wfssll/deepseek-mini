const $ = id => document.getElementById(id);
let current;
let shortcut = 'Command+Space';
let recording = false;
let lastView = '';
let lastHTML = '';
let lastSize = '';
let previewFont = null;
let toastTimer;
let submitting = false;

const shortcutLabel = value => value.replace(/CommandOrControl|Command/g, '⌘').replace(/Control/g, '⌃').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, ' ');
async function call(name, ...args) {
  const result = await window.mini[name](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function fit() {
  requestAnimationFrame(() => {
    if (!current) return;
    const height = element => element.hidden ? 0 : Math.ceil(element.getBoundingClientRect().height);
    const compactHeight = height(document.querySelector('.composer')) + height($('connection')) + height($('demo-label')) + height($('toast')) + 30;
    const size = { view: current.view, expanded: !$('response').hidden, compactHeight, setupHeight: height($('setup')) + 30 };
    const key = JSON.stringify(size);
    if (key !== lastSize) { lastSize = key; window.mini.resize(size); }
  });
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; fit(); }, 6500);
  fit();
}
function choose(value) {
  shortcut = value;
  document.querySelectorAll('[data-shortcut]').forEach(button => button.classList.toggle('selected', button.dataset.shortcut === value));
  const custom = !['Command+Space', 'Alt+Space'].includes(value);
  $('record').classList.toggle('selected', custom);
  $('record').textContent = custom ? shortcutLabel(value) : '自定义…';
}
function render(state) {
  current = state;
  applyFont(previewFont ?? state.settings.fontSize);
  const setup = state.view !== 'chat';
  $('setup').hidden = !setup; $('chat').hidden = setup;
  if (state.view !== lastView) {
    choose(state.settings.shortcut);
    $('autostart').checked = state.settings.launchAtLogin;
    $('setup-error').hidden = true;
    if (!setup) setTimeout(() => $('question').focus(), 100);
    lastView = state.view;
  }
  const settingsView = state.view === 'settings';
  $('setup-title').textContent = settingsView ? '你的快捷方式。' : '让灵感，随叫随到。';
  $('setup-subtitle').textContent = settingsView ? '让 DeepSeek 适应你的工作节奏。' : '一个快捷键，把 DeepSeek 带到你眼前。';
  $('finish').firstChild.textContent = settingsView ? '保存设置 ' : '完成设置，开始使用 ';
  $('autostart-row').hidden = state.demo;
  const ready = state.website.hasComposer;
  $('login-badge').textContent = ready ? (state.demo ? '演示已连接' : '已连接') : state.website.status === 'loading' ? '连接中' : '等待登录';
  $('login-badge').classList.toggle('connected', ready);
  $('login').firstChild.textContent = ready ? '查看官网 ' : '打开官网 ';
  $('shortcut-label').textContent = shortcutLabel(state.settings.shortcut);
  for (const name of ['think', 'search']) {
    $(name).setAttribute('aria-pressed', String(state.website[name] === true));
    $(name).disabled = !ready || state.awaiting || state.website.generating;
  }
  $('attach').disabled = !ready || state.awaiting || state.website.generating;
  const existingFiles = [...$('files').children].map(el => el.textContent).join('\0');
  if (existingFiles !== state.attachments.join('\0')) {
    $('files').replaceChildren(...state.attachments.map(name => {
      const chip = document.createElement('span'); chip.className = 'file-chip'; chip.textContent = name; return chip;
    }));
  }
  $('files').hidden = !state.attachments.length;
  const messages = {
    loading: '正在连接 DeepSeek…', login: '登录官网后，就可以在这里提问。',
    challenge: '请在官网窗口完成安全验证。', blocked: '官网暂时限制了访问，请稍后重新连接。',
    offline: '官网连接失败，请检查网络。', unsupported: '暂未找到官网输入框，请打开官网查看。'
  };
  $('connection').hidden = ready && !state.notice;
  $('connection-text').textContent = state.notice || messages[state.website.status] || '';
  $('connect-action').textContent = state.website.status === 'offline' || state.website.status === 'blocked' ? '重新连接 ↻' : '打开官网 ↗';
  $('response').hidden = !state.prompt && !state.answerHTML && !state.awaiting;
  $('prompt').textContent = state.prompt;
  $('waiting').hidden = !state.awaiting;
  $('stop').hidden = !state.website.generating;
  $('answer-status').textContent = state.website.generating ? '官网正在生成 · 内容实时同步' : '回答与官网同步';
  $('copy').disabled = !state.answerHTML;
  $('new-chat').disabled = state.awaiting || state.website.generating;
  if (state.answerHTML !== lastHTML) {
    const scroll = document.querySelector('.response-scroll');
    const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 50;
    $('answer').innerHTML = DOMPurify.sanitize(state.answerHTML, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'foreignObject'],
      FORBID_ATTR: ['style', 'srcset', 'id']
    });
    lastHTML = state.answerHTML;
    if (atEnd) scroll.scrollTop = scroll.scrollHeight;
  }
  $('demo-label').hidden = !state.demo;
  sendEnabled(); fit();
}
function sendEnabled() {
  $('send').disabled = !current?.website.hasComposer || current.awaiting || current.website.generating || submitting || !$('question').value.trim();
}
async function submit() {
  if ($('send').disabled) return;
  const text = $('question').value;
  submitting = true; sendEnabled();
  try { await call('send', text); $('question').value = ''; growInput(); }
  catch (error) { toast(error.message); }
  finally { submitting = false; sendEnabled(); }
}
function growInput() {
  $('question').style.height = '36px';
  $('question').style.height = `${Math.min(116, $('question').scrollHeight)}px`;
  fit(); sendEnabled();
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => call(button.dataset.action).catch(error => toast(error.message))));
document.querySelectorAll('[data-shortcut]').forEach(button => button.addEventListener('click', () => { recording = false; choose(button.dataset.shortcut); }));
$('record').addEventListener('click', () => { recording = true; $('record').textContent = '按下快捷键…'; });
document.addEventListener('keydown', event => {
  if (recording) {
    event.preventDefault();
    if (event.key === 'Escape') { recording = false; choose(shortcut); return; }
    const modifiers = [event.metaKey && 'Command', event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
    const key = event.code === 'Space' ? 'Space' : /^Key[A-Z]$/.test(event.code) ? event.code.slice(3) : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : /^F\d{1,2}$/.test(event.code) ? event.code : '';
    if (key && modifiers.some(x => x !== 'Shift')) { recording = false; choose([...modifiers, key].join('+')); }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); call('hide'); }
});
$('question').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); }
});
$('question').addEventListener('input', growInput);
$('send').addEventListener('click', submit);
for (const [id, action] of [['login', 'login'], ['full', 'login'], ['spotlight', 'spotlight'], ['attach', 'attach'], ['new-chat', 'newChat'], ['stop', 'stop']]) {
  $(id).addEventListener('click', () => call(action).catch(error => toast(error.message)));
}
for (const name of ['think', 'search']) $(name).addEventListener('click', () => call('mode', name).then(state => {
  if (state[name] === null) toast('已点击官网选项，但当前网页未提供可确认的选中状态。可在官网查看。');
}).catch(error => toast(error.message)));
$('connect-action').addEventListener('click', () => call(['offline', 'blocked'].includes(current.website.status) ? 'reload' : 'login').catch(error => toast(error.message)));
$('copy').addEventListener('click', () => call('copy', $('answer').innerText).then(() => toast('回答已复制')).catch(error => toast(error.message)));
$('answer').addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  try { call('external', new URL(link.getAttribute('href'), 'https://chat.deepseek.com').href).catch(error => toast(error.message)); }
  catch { toast('无法打开这个链接。'); }
});
$('finish').addEventListener('click', async () => {
  $('finish').disabled = true; $('setup-error').hidden = true;
  try { await call('setup', { shortcut, launchAtLogin: $('autostart').checked }); }
  catch (error) { $('setup-error').textContent = error.message; $('setup-error').hidden = false; fit(); }
  finally { $('finish').disabled = false; }
});
function applyFont(size) {
  const changed = document.documentElement.style.getPropertyValue('--content-font-size') !== size + 'px';
  document.documentElement.style.setProperty('--content-font-size', size + 'px');
  $('font-size').value = size; $('font-value').textContent = size + ' px';
  if (changed) growInput();
}
$('font-size').addEventListener('input', () => { previewFont = Number($('font-size').value); applyFont(previewFont); growInput(); });
$('font-size').addEventListener('change', () => call('appearance', { fontSize: Number($('font-size').value) }).then(() => { previewFont = null; }).catch(error => { previewFont = null; applyFont(current.settings.fontSize); toast(error.message); }));
for (const handle of document.querySelectorAll('[data-edge]')) {
  let origin;
  handle.addEventListener('pointerdown', event => {
    origin = { x: event.screenX, y: event.screenY }; handle.setPointerCapture(event.pointerId);
    window.mini.resizeDrag({ phase: 'start', edge: handle.dataset.edge }); event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (origin) window.mini.resizeDrag({ dx: event.screenX - origin.x, dy: event.screenY - origin.y });
  });
  const end = () => { origin = null; window.mini.resizeDrag({ phase: 'end' }); };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
}
window.addEventListener('resize', fit);
window.addEventListener('focus', () => { if (current?.view === 'chat') $('question').focus(); });
window.mini.onState(render);
call('state').then(render).catch(error => toast(error.message));
