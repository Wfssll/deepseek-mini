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
let pasting = false;

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
    const size = { view: current.view, expanded: !$('response').hidden, compactHeight, setupHeight: (current.view === 'help' ? height($('guide')) : height($('setup'))) + 30 };
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
  const setup = ['setup', 'settings'].includes(state.view);
  $('setup').hidden = !setup; $('chat').hidden = state.view !== 'chat'; $('guide').hidden = state.view !== 'help';
  $('guide-shortcut').textContent = shortcutLabel(state.settings.shortcut);
  if (state.view !== lastView) {
    choose(state.settings.shortcut);
    $('autostart').checked = state.settings.launchAtLogin;
    $('setup-error').hidden = true;
    if (state.view === 'chat') setTimeout(() => $('question').focus(), 100);
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
  $('attach').disabled = !ready || state.awaiting || state.uploading || pasting || state.website.generating;
  const busy = state.uploading || state.awaiting || state.website.generating;
  const imageNames = new Set((state.pastedImages || []).map(image => image.name));
  const key = JSON.stringify([state.attachments, busy]);
  const removeButton = name => {
    const button = document.createElement('button'); button.className = 'attachment-remove';
    button.textContent = '×'; button.title = '删除附件'; button.setAttribute('aria-label', '删除附件 ' + name); button.disabled = busy;
    button.onclick = () => call('removeAttachment', name).catch(error => toast(error.message)); return button;
  };
  if ($('files').dataset.key !== key) {
    $('files').dataset.key = key;
    $('files').replaceChildren(...state.attachments.filter(name => !imageNames.has(name)).map(name => {
      const chip = document.createElement('span'); chip.className = 'file-chip';
      const label = document.createElement('span'); label.textContent = name; label.title = name;
      chip.append(label, removeButton(name)); return chip;
    }));
    $('images').replaceChildren(...(state.pastedImages || []).map(image => {
      const card = document.createElement('span'); card.className = 'attachment-preview';
      const img = document.createElement('img'); img.src = image.preview; img.alt = image.name;
      card.append(img, removeButton(image.name)); return card;
    }));
  }
  $('files').hidden = !$('files').children.length;
  $('images').hidden = !$('images').children.length;
  const messages = {
    loading: '正在连接 DeepSeek…', login: '登录官网后，就可以在这里提问。',
    challenge: '请在官网窗口完成安全验证。', blocked: '官网暂时限制了访问，请稍后重新连接。',
    offline: '官网连接失败，请检查网络。', unsupported: '暂未找到官网输入框，请打开官网查看。'
  };
  $('connection').hidden = ready && !state.notice;
  $('connection-text').textContent = state.notice || messages[state.website.status] || '';
  $('connect-action').textContent = state.website.status === 'offline' || state.website.status === 'blocked' ? '重新连接 ↻' : '打开官网 ↗';
  $('response').hidden = !state.conversation.length;
  $('prompt').textContent = state.prompt;
  $('waiting').hidden = !state.awaiting;
  $('stop').hidden = !state.website.generating;
  $('answer-status').textContent = state.website.generating ? '官网正在生成 · 内容实时同步' : '回答与官网同步';
  $('copy').disabled = !state.answerHTML;
  $('new-chat').disabled = state.awaiting || state.website.generating;
  const historyKey = JSON.stringify(state.conversation);
  if (historyKey !== lastHTML) {
    const scroll = document.querySelector('.response-scroll');
    const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 50;
    const oldTop = scroll.scrollTop;
    const sanitize = html => DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'foreignObject'],
      FORBID_ATTR: ['style', 'srcset', 'id']
    });
    $('conversation').replaceChildren(...state.conversation.map(turn => {
      const section = document.createElement('section'); section.className = 'conversation-turn';
      const question = document.createElement('p'); question.className = 'prompt'; question.textContent = turn.prompt;
      const files = document.createElement('p'); files.className = 'turn-files'; files.textContent = turn.files.join(' · '); files.hidden = !turn.files.length;
      const answer = document.createElement('article'); answer.className = 'answer'; answer.innerHTML = sanitize(turn.html);
      section.append(question, files, answer); return section;
    }));
    $('answer').hidden = true;
    lastHTML = historyKey;
    scroll.scrollTop = atEnd ? scroll.scrollHeight : oldTop;
  }
  $('demo-label').hidden = !state.demo;
  sendEnabled(); fit();
}
function sendEnabled() {
  $('send').disabled = !current?.website.hasComposer || current.awaiting || current.website.generating || current.uploading || pasting || submitting || !$('question').value.trim();
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
async function pastePictures(files = []) {
  if (pasting) return;
  pasting = true; sendEnabled(); $('attach').disabled = true;
  try {
    if (!files.length) await call('pasteImage');
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB，请通过加号选择文件。');
      await call('pasteImage', { bytes: new Uint8Array(await file.arrayBuffer()) });
    }
  } catch (error) { toast(error.message); }
  finally { pasting = false; render(current); }
}
$('question').addEventListener('paste', event => {
  const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
  const hasImage = files.length || [...(event.clipboardData?.items || [])].some(item => item.type.startsWith('image/'));
  if (!hasImage) return;
  event.preventDefault(); pastePictures(files);
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
$('copy').addEventListener('click', () => call('copy', [...document.querySelectorAll('#conversation .answer')].at(-1)?.innerText || '').then(() => toast('回答已复制')).catch(error => toast(error.message)));
$('conversation').addEventListener('click', event => {
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
