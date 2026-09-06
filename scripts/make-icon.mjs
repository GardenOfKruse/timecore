/* 生成 build/icon.ico
 * 优先使用 build/icon-source.png（外部生成，256×256 RGBA）直接封装；
 * 不存在则回退到内置绘制的圆环图案。
 * 运行：node scripts/make-icon.mjs */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
const SOURCE = new URL('../build/icon-source.png', import.meta.url);

function wrapIco(png) {
  const icon = Buffer.alloc(6 + 16 + png.length);
  icon.writeUInt16LE(0, 0); icon.writeUInt16LE(1, 2); icon.writeUInt16LE(1, 4);
  icon[6] = 0; icon[7] = 0;                 // 256 用 0 表示
  icon.writeUInt16LE(1, 10); icon.writeUInt16LE(32, 12);
  icon.writeUInt32LE(png.length, 14);
  icon.writeUInt32LE(22, 18);
  png.copy(icon, 22);
  return icon;
}

if (existsSync(SOURCE)) {
  const png = readFileSync(SOURCE);
  if (png.length < 100 || png[0] !== 0x89) throw new Error('icon-source.png 不是有效的 PNG');
  writeFileSync(new URL('../build/icon.ico', import.meta.url), wrapIco(png));
  console.log('build/icon.ico 生成完成（外部源图）:', png.length, 'bytes');
  process.exit(0);
}

// 回退：内置绘制的圆环图案
const SIZE = 256;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));   // 每行前置 filter byte 0

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const o = y * (SIZE * 4 + 1) + 1 + x * 4;
  const pa = raw[o + 3];
  const na = a + (pa * (255 - a)) / 255;             // 简单 alpha 叠加
  raw[o] = (r * a + raw[o] * pa * (255 - a)) / (na * 255);
  raw[o + 1] = (g * a + raw[o + 1] * pa * (255 - a)) / (na * 255);
  raw[o + 2] = (b * a + raw[o + 2] * pa * (255 - a)) / (na * 255);
  raw[o + 3] = na;
}

const CX = 128, CY = 128;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - CX, dy = y - CY;
    const r = Math.sqrt(dx * dx + dy * dy);
    // 深底圆盘
    if (r <= 118) setPx(x, y, 8, 14, 26, 255);
    // 主圆环（青色渐变 84..106）
    if (r >= 84 && r <= 106) {
      const t = Math.min(1, Math.max(0, (r - 84) / 22));
      const rr = Math.round(46 + t * 92), gg = Math.round(190 + t * 50), bb = Math.round(216 + t * 39);
      const edge = Math.min(1, (106 - r) / 2, (r - 84) / 2);
      setPx(x, y, rr, gg, bb, Math.round(255 * Math.max(0, edge)));
    }
    // 内核亮点
    if (r <= 34) {
      const t = r / 34;
      setPx(x, y, 57, 215, 255, Math.round(235 * (1 - t * 0.55)));
    } else if (r <= 44) {
      const t = (r - 34) / 10;
      setPx(x, y, 57, 215, 255, Math.round(120 * (1 - t)));
    }
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

// ICO 容器：1 个 256×256 PNG 条目
const icon = Buffer.alloc(6 + 16 + png.length);
icon.writeUInt16LE(0, 0); icon.writeUInt16LE(1, 2); icon.writeUInt16LE(1, 4);
icon[6] = 0; icon[7] = 0;                 // 256 用 0 表示
icon.writeUInt16LE(1, 10); icon.writeUInt16LE(32, 12);
icon.writeUInt32LE(png.length, 14);
icon.writeUInt32LE(22, 18);
png.copy(icon, 22);

writeFileSync(new URL('../build/icon.ico', import.meta.url), icon);
console.log('build/icon.ico 生成完成:', icon.length, 'bytes, PNG', png.length, 'bytes');
