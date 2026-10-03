// This is the only module coupled to the official website's DOM.
// It runs in the website, without Node.js, cookies or token access.
function websiteOperation(operation, argument) {
  const visible = element => !!element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const editor = () => [...document.querySelectorAll('textarea#chat-input, textarea[placeholder], [contenteditable="true"][role="textbox"]')]
    .find(el => visible(el) && (el.id === 'chat-input' || /发消息|发送消息|Message|Ask|询问|给 DeepSeek/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')));
  const controls = () => [...document.querySelectorAll('button, [role="button"], .ds-button, .ds-icon-button, .ds-toggle-button')].filter(visible);
  const label = el => [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' ').trim();
  const modeControl = kind => controls().find(el => {
    const text = label(el);
    return text.length < 100 && (kind === 'think' ? /深度思考|DeepThink|Deep Think/i : /智能搜索|联网搜索|^搜索$|^Search$|Smart Search/i).test(text);
  });
  const selected = el => {
    if (!el) return null;
    const aria = el.getAttribute('aria-pressed');
    if (aria !== null) return aria === 'true';
    const state = el.getAttribute('data-state');
    if (state === 'on' || state === 'off') return state === 'on';
    if (/selected|active|checked/.test(el.className)) return true;
    const color = getComputedStyle(el).color;
    if (/rgb\(77, 107, 254\)|rgb\(75, 107, 251\)|rgb\(59, 130, 246\)/.test(color)) return true;
    // Native DeepSeek buttons use a neutral color when not selected.
    if (/rgb\((\d+), \1, \1\)/.test(color)) return false;
    return null;
  };
  const attachmentCard = name => {
    const input = editor();
    let scope = input?.parentElement;
    while (scope && scope !== document.body && !scope.querySelector('.ds-toggle-button, [aria-pressed]')) scope = scope.parentElement;
    scope = scope && scope !== document.body ? scope : input?.closest('form');
    if (!scope) return null;
    // Official attachment row is a sibling of the textarea/mode container.
    if (scope.tagName !== 'FORM' && scope.parentElement && scope.parentElement !== document.body) scope = scope.parentElement;
    const matches = [...scope.querySelectorAll('*')].filter(el => visible(el) &&
      (el.textContent.trim() === name || el.getAttribute('title') === name || el.getAttribute('alt') === name));
    for (const match of matches.reverse()) {
      for (let card = match; card && card !== scope; card = card.parentElement) {
        const buttons = [...card.querySelectorAll('button, [role="button"], .ds-icon-button')];
        const remove = card.querySelector('.c8b3f8a6[tabindex="0"]') ||
          buttons.find(el => /删除|移除|取消|Remove|Delete|Cancel|Close|关闭/i.test(label(el))) ||
          buttons.find(el => !label(el) && el.querySelector('svg') && !el.className.includes('disabled'));
        if (remove) return { card, remove };
      }
    }
    return null;
  };
  const snapshot = () => {
    const input = editor();
    const text = document.body?.innerText || document.body?.textContent || '';
    const markdown = [...document.querySelectorAll('.ds-markdown, [data-role="assistant"] .markdown, [data-message-author-role="assistant"]')].filter(visible);
    const answer = markdown.at(-1);
    const stop = controls().find(el => /停止生成|停止回答|Stop generating|Stop response/i.test(label(el)));
    let status = input ? 'ready' : 'unsupported';
    if (!input && /登录|Log in|Sign in/i.test(text)) status = 'login';
    if (/验证您是人类|Verify you are human|Checking your browser|安全验证/i.test(text)) status = 'challenge';
    if (/Rate Limit Reached|Request Blocked|Access Denied|ERR_/i.test(text)) status = 'blocked';
    return { status, hasComposer: !!input, think: selected(modeControl('think')), search: selected(modeControl('search')),
      canUpload: !!document.querySelector('input[type="file"]'), html: answer?.innerHTML || '',
      answerCount: markdown.length, generating: !!stop,
      errors: [...document.querySelectorAll('[role="alert"], .ds-toast')].filter(visible).map(el => el.textContent.trim()).join(' ').slice(0, 500) };
  };
  if (operation === 'snapshot') return snapshot();
  if (operation === 'attachment-present') return !!attachmentCard(argument);
  const input = editor();
  if (operation === 'accepted') return !!input && !(input.value ?? input.textContent).trim();
  if (!input) throw new Error('DeepSeek 输入框尚未就绪，请打开官网完成登录，或检查网络。');
  if (operation === 'remove-attachment') {
    const target = attachmentCard(argument);
    if (!target) throw new Error('未找到官网的附件删除按钮，请打开官网查看。');
    target.remove.click(); return true;
  }
  if (operation === 'focus') { input.focus(); return true; }
  if (operation === 'submit') {
    // React's own button handler works even when the website window is hidden.
    // Never retry a click: delayed website acknowledgement must not send twice.
    let scope = input.parentElement;
    while (scope && scope !== document.body && !scope.querySelector('.ds-toggle-button, [aria-pressed]')) scope = scope.parentElement;
    if (!scope || scope === document.body) scope = input.closest('form') || input.parentElement;
    const candidates = [...scope.querySelectorAll('button, [role="button"], .ds-icon-button')].filter(visible);
    let target = candidates.find(el => /^(发送|发送消息|Send|Send message)(\s|$)/i.test(label(el)));
    if (!target) {
      // Current official composer uses an unlabelled icon at the lower right.
      // Limit the fallback to the composer and its right-hand icon controls.
      const box = input.getBoundingClientRect();
      const icons = candidates.filter(el => !label(el) && el.querySelector('svg') &&
        el.getBoundingClientRect().left >= box.left + box.width / 2 &&
        el.getBoundingClientRect().top >= box.top);
      target = icons.at(-1);
    }
    if (!target) throw new Error('暂未找到官网发送按钮，请打开官网查看。问题已保留。');
    if (target.disabled || target.getAttribute('aria-disabled') === 'true' || /--disabled/.test(target.className)) {
      throw new Error('官网发送按钮暂不可用，请等待文件解析完成，或在官网查看提示。问题已保留。');
    }
    target.click(); return true;
  }
  if (operation === 'fill') {
    if (typeof argument !== 'string' || !argument.trim()) throw new Error('请输入问题。');
    if (snapshot().generating) throw new Error('请等待当前回答结束，或先停止生成。');
    const baseline = snapshot();
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, argument);
    } else input.textContent = argument;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: argument }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { html: baseline.html, answerCount: baseline.answerCount };
  }
  if (operation === 'mode') {
    if (!['think', 'search'].includes(argument)) throw new Error('未知选项。');
    const target = modeControl(argument);
    if (!target) throw new Error('官网的这个选项暂不可用，请在完整官网窗口查看。');
    target.click();
    return true;
  }
  if (operation === 'stop') {
    const target = controls().find(el => /停止生成|停止回答|Stop generating|Stop response/i.test(label(el)));
    if (!target) throw new Error('请打开完整官网窗口，使用官网的停止按钮。');
    target.click(); return true;
  }
  if (operation === 'file-input') {
    const existing = document.querySelector('input[type="file"]');
    if (existing) return true;
    const target = controls().find(el => /上传文件|添加附件|Upload file|Attach file/i.test(label(el)));
    if (target) target.click();
    return !!document.querySelector('input[type="file"]');
  }
  throw new Error('不支持的网页操作。');
}

module.exports = { websiteOperation };
