const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clipboardImageBytes, MAX_IMAGE_BYTES } = require('../src/images');

test('clipboard image reading chooses PNG without reading text or other formats', async () => {
  const requested = [];
  const api = { read: async () => [{ types: ['text/plain', 'image/jpeg', 'image/png'], getType: async type => {
    requested.push(type); return new Blob([new Uint8Array([137,80,78,71])], { type });
  } }] };
  assert.deepEqual([...await clipboardImageBytes(api)], [137,80,78,71]);
  assert.deepEqual(requested, ['image/png']);
});
test('text-only clipboard reports a helpful image-copy error', async () => {
  await assert.rejects(clipboardImageBytes({ read: async () => [{ types: ['text/plain'], getType: () => assert.fail('Do not read text') }] }), /复制图片中的文字/);
});
test('oversized clipboard images are rejected before allocating their bytes', async () => {
  await assert.rejects(clipboardImageBytes({ read: async () => [{ types: ['image/png'], getType: async () => ({ size: MAX_IMAGE_BYTES + 1, arrayBuffer: () => assert.fail('Do not load oversized data') }) }] }), /20 MB/);
});
