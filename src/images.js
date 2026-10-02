const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function clipboardImageBytes(clipboard) {
  const items = await clipboard.read();
  for (const item of items) {
    const type = ['image/png', 'image/jpeg'].find(type => item.types.includes(type)) || item.types.find(type => type.startsWith('image/'));
    if (!type) continue;
    const image = await item.getType(type);
    if (image.size > MAX_IMAGE_BYTES) throw new Error('图片超过 20 MB，请通过加号选择文件。');
    return Buffer.from(await image.arrayBuffer());
  }
  throw new Error('剪贴板里没有图片。请复制截图或图片内容，再按 ⌘ V；复制图片中的文字只会粘贴文字。');
}

module.exports = { MAX_IMAGE_BYTES, clipboardImageBytes };
