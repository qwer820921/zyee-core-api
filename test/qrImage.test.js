import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { toPng, toSvg } from '../src/utils/qrImage.js';
import { handleQRImage } from '../src/api/qrImage.js';

const TEXT = 'https://zyee-core-api.qwer820921.workers.dev/q/a1b2c3';

function decodePng(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
}

test('PNG 可被 QR 解碼器讀回原文', async () => {
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    const { bytes } = await toPng(TEXT, { size: 400, ecc });
    assert.equal(decodePng(bytes)?.data, TEXT, `ecc ${ecc}`);
  }
});

test('較長內容也能產生並讀回', async () => {
  const t = 'https://example.com/go/2610000001?x=' + 'a'.repeat(200);
  const { bytes } = await toPng(t, { size: 600 });
  assert.equal(decodePng(bytes)?.data, t);
});

test('SVG 格式', () => {
  const svg = toSvg(TEXT);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg [^>]*viewBox/);
});

test('GET /api/qr/image 回 PNG', async () => {
  const req = new Request('https://x.test/api/qr/image?data=' + encodeURIComponent(TEXT) + '&size=300');
  const res = await handleQRImage(req, {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  assert.equal(decodePng(new Uint8Array(await res.arrayBuffer()))?.data, TEXT);
});

test('參數檢查', async () => {
  const bad = async (q) => (await handleQRImage(new Request('https://x.test/api/qr/image?' + q), {})).status;
  assert.equal(await bad(''), 400);
  assert.equal(await bad('data=a&format=gif'), 400);
  assert.equal(await bad('data=a&size=50'), 400);
  assert.equal(await bad('data=a&ecc=Z'), 400);
});

test('store 只允許 Google 網域', async () => {
  const req = new Request('https://x.test/api/qr/image', {
    method: 'POST',
    body: JSON.stringify({ data: 'a', store: { type: 'webhook', url: 'https://evil.example.com/x' } })
  });
  const res = await handleQRImage(req, {});
  assert.equal(res.status, 400);
});

test('store webhook:送出 base64 與欄位,回傳對方結果', async () => {
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (u, init) => {
    sent = { u, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ ok: true, fileId: 'F1' }), { status: 200 });
  };
  try {
    const req = new Request('https://x.test/api/qr/image', {
      method: 'POST',
      body: JSON.stringify({
        data: TEXT, format: 'png',
        store: { type: 'webhook', url: 'https://script.google.com/macros/s/ABC/exec', folderId: 'FOLDER', fileName: 'sn1.png', token: 'T' }
      })
    });
    const res = await handleQRImage(req, {});
    const j = await res.json();
    assert.equal(j.success, true);
    assert.deepEqual(j.stored, { ok: true, fileId: 'F1' });
    assert.equal(sent.body.action, 'qrsave');
    assert.equal(sent.body.folderId, 'FOLDER');
    assert.equal(sent.body.fileName, 'sn1.png');
    assert.equal(sent.body.mimeType, 'image/png');
    assert.equal(decodePng(Buffer.from(sent.body.base64, 'base64'))?.data, TEXT);
  } finally { globalThis.fetch = realFetch; }
});
