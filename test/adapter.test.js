const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const createPurify = require('dompurify');
const { websiteOperation } = require('../src/adapter');
function page(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://chat.deepseek.com' });
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  dom.window.eval(`window.operate = ${websiteOperation.toString()}`);
  return dom.window;
}
const composer = '<textarea id="chat-input" placeholder="给 DeepSeek 发送消息"></textarea><button aria-pressed="false" id="think">深度思考</button><button aria-pressed="false">联网搜索</button>';
test('recognizes login, challenge, blocked and changed website layouts explicitly', () => {
  for (const [text, expected] of [['Log in to DeepSeek', 'login'], ['Verify you are human', 'challenge'], ['Rate Limit Reached', 'blocked'], ['Unrecognized site layout', 'unsupported']]) {
    const window = page(`<p>${text}</p>`); assert.equal(window.operate('snapshot').status, expected); window.close();
  }
});
test('fills the native input and emits the event used by the website', () => {
  const window = page(composer + '<div class="ds-markdown">old answer</div>');
  let input = 0; window.document.querySelector('textarea').addEventListener('input', () => input++);
  const baseline = window.operate('fill', 'hello');
  assert.equal(input, 1); assert.equal(baseline.html, 'old answer');
  assert.equal(window.document.querySelector('textarea').value, 'hello');
  assert.equal(window.operate('accepted', 'hello'), false);
  window.document.querySelector('textarea').value = '';
  assert.equal(window.operate('accepted', 'hello'), true); window.close();
});
test('reads actual mode state and actual answer markup', () => {
  const window = page(composer + '<div class="ds-markdown"><p>real <strong>answer</strong></p></div>');
  window.document.querySelector('#think').onclick = function () { this.setAttribute('aria-pressed', 'true'); };
  window.operate('mode', 'think');
  assert.equal(window.operate('snapshot').think, true);
  assert.match(window.operate('snapshot').html, /<strong>answer<\/strong>/); window.close();
});
test('recognizes current official toggle controls and intelligent search naming', () => {
  const window = page('<textarea placeholder="给 DeepSeek 发送消息 "></textarea><div tabindex="0" class="ds-toggle-button" aria-pressed="false">深度思考</div><div tabindex="0" class="ds-toggle-button ds-toggle-button--selected" aria-pressed="true">智能搜索</div>');
  const state = window.operate('snapshot');
  assert.equal(state.status, 'ready'); assert.equal(state.think, false); assert.equal(state.search, true); window.close();
});
test('does not submit into a changed or unrelated page', () => {
  const window = page('<textarea placeholder="Login code"></textarea>');
  assert.throws(() => window.operate('fill', 'private question'), /尚未就绪/); window.close();
});
test('refuses to replace a question while the website is generating', () => {
  const window = page(composer + '<button aria-label="Stop generating">Stop</button>');
  assert.throws(() => window.operate('fill', 'next question'), /等待/); window.close();
});
test('answer sanitizer removes executable content while preserving formatting', () => {
  const window = page('');
  const purify = createPurify(window);
  const safe = purify.sanitize('<p onclick="bad()">answer</p><script>bad()</script><a href="javascript:bad()">link</a><strong>format</strong>');
  assert.doesNotMatch(safe, /onclick|<script|javascript:/);
  assert.match(safe, /<strong>format<\/strong>/); window.close();
});
