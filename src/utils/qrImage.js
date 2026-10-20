/**
 * QR Code 圖片產生工具（純 JS，Workers 與 Node 都能跑）
 * 以 qrcode-generator 算出矩陣，再自行輸出 SVG 或 PNG（Workers 沒有 canvas）。
 */
import qrcode from 'qrcode-generator';

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

/** 回傳 { count, isDark(r, c) } */
export function buildMatrix(data, ecc = 'M') {
  const qr = qrcode(0, ecc); // typeNumber 0 = 依內容自動選版本
  qr.addData(data, 'Byte');
  qr.make();
  return { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/** 依目標像素大小決定每個模組的像素數（整數，至少 1） */
export function layout(count, size, margin) {
  const total = count + margin * 2;
  const cell = Math.max(1, Math.floor(size / total));
  return { total, cell, px: total * cell };
}

export function toSvg(data, { size = 400, margin = 4, ecc = 'M' } = {}) {
  const m = buildMatrix(data, ecc);
  const { total, cell, px } = layout(m.count, size, margin);
  let path = '';
  for (let r = 0; r < m.count; r++) {
    for (let c = 0; c < m.count; c++) {
      if (m.isDark(r, c)) path += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// ---------- PNG ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate')); // zlib 格式
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 8-bit 灰階 PNG */
export async function toPng(data, { size = 400, margin = 4, ecc = 'M' } = {}) {
  const m = buildMatrix(data, ecc);
  const { cell, px } = layout(m.count, size, margin);
  const raw = new Uint8Array((px + 1) * px); // 每列前面一個 filter byte(0)
  for (let y = 0; y < px; y++) {
    const row = y * (px + 1);
    raw[row] = 0;
    const r = Math.floor(y / cell) - margin;
    for (let x = 0; x < px; x++) {
      const c = Math.floor(x / cell) - margin;
      const dark = r >= 0 && c >= 0 && r < m.count && c < m.count && m.isDark(r, c);
      raw[row + 1 + x] = dark ? 0 : 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, px); dv.setUint32(4, px);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit 灰階、無交錯
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out, width: px, height: px };
}
