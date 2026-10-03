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

test('submits via the website button without needing a focused window', () => {
 const window = page('<form>' + composer + '<button type="button" aria-label="发送">Send</button></form>');
 let clicks=0; window.document.querySelector('[aria-label="发送"]').onclick=()=>{clicks++;window.document.querySelector('textarea').value='';};
 window.operate('fill','test');window.document.querySelector('textarea').blur();window.operate('submit');
 assert.equal(clicks,1);assert.equal(window.operate('accepted','test'),true);window.close();
});
test('keeps the draft when file processing disables the website send button', () => {
 const window=page('<form>'+composer+'<button aria-label="发送" disabled>Send</button></form>');
 window.operate('fill','keep this');assert.throws(()=>window.operate('submit'),/解析/);
 assert.equal(window.document.querySelector('textarea').value,'keep this');window.close();
});
test('only clicks the unlabelled send icon inside the official composer', () => {
 const window=page('<button id="outside"><svg></svg></button><div>'+composer+'<div role="button" id="upload"><svg></svg></div><div class="ds-icon-button" id="native-send"><svg></svg></div></div>');
 window.document.querySelector('textarea').getBoundingClientRect=()=>({left:20,top:10,width:400});
 for(const id of ['outside','upload'])window.document.getElementById(id).getBoundingClientRect=()=>({left:10,top:60});
 window.document.getElementById('native-send').getBoundingClientRect=()=>({left:420,top:60});
 let clicked='';for(const id of ['outside','upload','native-send'])window.document.getElementById(id).onclick=()=>{clicked=id;};
 window.operate('fill','hello');window.operate('submit');assert.equal(clicked,'native-send');window.close();
});

test('removes only the named pending attachment, preserving other files and draft', () => {
  const window = page('<div>'+composer+'<div><span>a.png</span><button aria-label="删除附件" id="a">×</button></div><div><span>b.png</span><button aria-label="删除附件" id="b">×</button></div></div>');
  window.document.querySelector('textarea').value='keep draft';
  window.document.getElementById('a').onclick=function(){this.parentElement.remove();};
  window.operate('remove-attachment','a.png');
  assert.equal(window.operate('attachment-present','a.png'),false);
  assert.equal(window.operate('attachment-present','b.png'),true);
  assert.equal(window.document.querySelector('textarea').value,'keep draft'); window.close();
});
test('recognizes the official image close control in a sibling attachment row', () => {
  const window=page('<div><div><div role="button"><img alt="test.png"><div class="c8b3f8a6" tabindex="0"><svg></svg></div></div></div><div>'+composer+'</div></div>');
  let clicks=0; window.document.querySelector('.c8b3f8a6').onclick=function(){clicks++;this.parentElement.remove();};
  window.operate('remove-attachment','test.png');
  assert.equal(clicks,1);assert.equal(window.operate('attachment-present','test.png'),false);window.close();
});
test('never deletes attachments in previously sent messages', () => {
  const window=page('<main><section><span>old.png</span><button aria-label="删除附件">×</button></section><form>'+composer+'</form></main>');
  assert.throws(()=>window.operate('remove-attachment','old.png'),/未找到/);window.close();
});
