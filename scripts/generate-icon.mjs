// Source-of-truth generator for the Spool app icon (PLAN_EN.md §14.2 / Phase 12).
// Renders an amber rounded-square with a stylized white "S" at 1024px, then
// downsamples to every size the bundle config consumes (icons/*.png) and stitches
// an .iconset → .icns via `iconutil`, plus a single-image .ico for Windows.
//
// Run with `node scripts/generate-icon.mjs`. No npm deps — uses zlib + crc32 from
// the Node 22+ stdlib. iconutil/sips are macOS-only; running this on Linux will
// produce only the PNGs.

import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 1024; // master canvas; everything else downsamples from this
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(REPO, 'src-tauri', 'icons');

// Brand palette — kept in sync with src/styles/tokens.css (--accent / --paper).
const AMBER = [0xb4, 0x53, 0x09, 0xff];
const PAPER = [0xfa, 0xf7, 0xf0, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

const inRoundedSquare = (x, y, size, radius) => {
  if (x < radius && y < radius) return Math.hypot(radius - x, radius - y) <= radius;
  if (x > size - radius && y < radius)
    return Math.hypot(x - (size - radius), radius - y) <= radius;
  if (x < radius && y > size - radius)
    return Math.hypot(radius - x, y - (size - radius)) <= radius;
  if (x > size - radius && y > size - radius)
    return Math.hypot(x - (size - radius), y - (size - radius)) <= radius;
  return true;
};

// Stylized S = three horizontal bars + two connectors. All measurements in fractions
// of the canvas so the same logic works at any rasterization scale.
const STROKE = 0.13; // bar thickness, fraction of canvas
const INSET = 0.225; // left/right margin for the bars
const isInS = (fx, fy) => {
  const insetL = INSET;
  const insetR = 1 - INSET;
  const halfStroke = STROKE / 2;
  const topY = 0.225;
  const midY = 0.5;
  const botY = 0.775;
  // Three horizontal bars
  if (fx >= insetL && fx <= insetR) {
    if (Math.abs(fy - topY) <= halfStroke) return true;
    if (Math.abs(fy - midY) <= halfStroke) return true;
    if (Math.abs(fy - botY) <= halfStroke) return true;
  }
  // Left connector between top and middle bar (the top half of an S curves down-left)
  if (fy >= topY && fy <= midY && Math.abs(fx - insetL) <= halfStroke) return true;
  // Right connector between middle and bottom bar (the bottom half curves down-right)
  if (fy >= midY && fy <= botY && Math.abs(fx - insetR) <= halfStroke) return true;
  return false;
};

const renderMaster = () => {
  const buf = Buffer.alloc(SRC * SRC * 4);
  const radius = SRC * 0.22;
  for (let y = 0; y < SRC; y++) {
    for (let x = 0; x < SRC; x++) {
      const off = (y * SRC + x) * 4;
      const fx = x / SRC;
      const fy = y / SRC;
      let color = TRANSPARENT;
      if (inRoundedSquare(x, y, SRC, radius)) {
        color = isInS(fx, fy) ? PAPER : AMBER;
      }
      buf[off] = color[0];
      buf[off + 1] = color[1];
      buf[off + 2] = color[2];
      buf[off + 3] = color[3];
    }
  }
  return buf;
};

// Area-average downsample from SRC to `dst`. Box filter; cheap and acceptable for
// icon sizes because the master already has hard geometric edges.
const downsample = (master, dst) => {
  const scale = SRC / dst;
  const out = Buffer.alloc(dst * dst * 4);
  for (let dy = 0; dy < dst; dy++) {
    const y0 = Math.floor(dy * scale);
    const y1 = Math.floor((dy + 1) * scale);
    for (let dx = 0; dx < dst; dx++) {
      const x0 = Math.floor(dx * scale);
      const x1 = Math.floor((dx + 1) * scale);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * SRC + xx) * 4;
          r += master[o];
          g += master[o + 1];
          b += master[o + 2];
          a += master[o + 3];
          n++;
        }
      }
      const o = (dy * dst + dx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
};

// Encode an RGBA pixel buffer as PNG. Filter byte 0 (none) for every scanline —
// simpler than picking a per-row filter and the size difference is negligible
// for icon-sized images.
const encodePng = (rgba, size) => {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// Single-image PNG-payload .ico (BMP variant not needed — modern Windows and the
// Tauri windows bundler both accept PNG-encoded ICOs).
const encodeIco = (pngBuf, size) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size; // 256 encoded as 0 per spec
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12); // offset to image data (6 + 16)
  return Buffer.concat([header, entry, pngBuf]);
};

const main = () => {
  console.log(`[icon] rendering master canvas (${SRC}x${SRC})`);
  const master = renderMaster();

  const targets = [16, 32, 48, 64, 128, 256, 512, 1024];
  const samples = new Map();
  for (const s of targets) {
    samples.set(s, s === SRC ? master : downsample(master, s));
  }

  // Bundle config (src-tauri/tauri.conf.json) reads these PNG paths verbatim.
  const pngOutputs = [
    ['32x32.png', 32],
    ['128x128.png', 128],
    ['128x128@2x.png', 256],
    ['icon.png', 1024],
  ];
  for (const [name, size] of pngOutputs) {
    const png = encodePng(samples.get(size), size);
    writeFileSync(join(ICON_DIR, name), png);
    console.log(`[icon] wrote ${name} (${size}px, ${png.length}B)`);
  }

  // .icns via iconutil — needs a temp .iconset directory with Apple's naming.
  const iconset = join(ICON_DIR, 'icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset);
  const icnsLayout = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, size] of icnsLayout) {
    writeFileSync(join(iconset, name), encodePng(samples.get(size), size));
  }
  try {
    execSync(`iconutil -c icns -o "${join(ICON_DIR, 'icon.icns')}" "${iconset}"`, {
      stdio: 'inherit',
    });
    console.log('[icon] wrote icon.icns');
  } catch (e) {
    console.warn('[icon] iconutil unavailable — icon.icns not regenerated');
  } finally {
    rmSync(iconset, { recursive: true, force: true });
  }

  // .ico — single 256px PNG payload. Windows + the Tauri bundler accept this form.
  const ico = encodeIco(encodePng(samples.get(256), 256), 256);
  writeFileSync(join(ICON_DIR, 'icon.ico'), ico);
  console.log(`[icon] wrote icon.ico (${ico.length}B)`);
};

main();
