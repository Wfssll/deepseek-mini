const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const directory = path.join(__dirname, '..', 'src', 'assets');
fs.mkdirSync(directory, { recursive: true });
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (1 + size * 4) + 1 + x * 4;
    const rgba = pixel((x + .5) / size, (y + .5) / size);
    rgba.forEach((v, i) => raw[offset + i] = v);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function glyph(x, y) {
  const radius = Math.hypot(x - .42, y - .56);
  return (radius < .185 && radius > .108) || (x > .528 && x < .605 && y > .24 && y < .56) || Math.hypot(x - .738, y - .68) < .047;
}
fs.writeFileSync(path.join(directory, 'tray.png'), png(22, (x, y) => [0, 0, 0, glyph(x, y) ? 255 : 0]));
fs.writeFileSync(path.join(directory, 'icon.png'), png(1024, (x, y) => {
  const outside = Math.hypot(Math.max(.23 - x, 0, x - .77), Math.max(.23 - y, 0, y - .77)) > .20;
  if (outside) return [0, 0, 0, 0];
  return glyph(x, y) ? [255, 255, 255, 255] : [77, Math.round(107 + 10 * (1 - y)), 254, 255];
}));
console.log('App and menu-bar icons created.');
