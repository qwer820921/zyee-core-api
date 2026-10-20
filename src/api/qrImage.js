import { CORS_HEADERS } from '../utils/cors.js';
import { ECC_LEVELS, toSvg, toPng } from '../utils/qrImage.js';

// ==========================================
// ⬛ API 4: 產生 QR Code 圖片 (/api/qr/image)
// ==========================================
// GET  /api/qr/image?data=...&format=png|svg&size=400&margin=4&ecc=M
//      → 直接回傳圖片（可當 <img src>）
// POST /api/qr/image  body 同上，另可帶 store，產圖後轉存到指定位置：
//      store: { type: "webhook", url, fileName, folderId, token }
//      Worker 會把圖片 base64 以 POST 送到 url（例如 Google Apps Script 的 doPost，由它存進 Drive）：
//      { action: "qrsave", token, folderId, fileName, mimeType, base64 }
const STORE_HOST_ALLOWLIST = ['script.google.com', 'script.googleusercontent.com'];
const MAX_DATA_LENGTH = 1000;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function handleQRImage(request, env) {
  try {
    const url = new URL(request.url);
    const params = request.method === 'POST' ? await request.json() : Object.fromEntries(url.searchParams);

    const data = params.data;
    if (typeof data !== 'string' || !data) return jsonResponse({ success: false, error: "請提供 data" }, 400);
    if (data.length > MAX_DATA_LENGTH) return jsonResponse({ success: false, error: `data 不可超過 ${MAX_DATA_LENGTH} 字元` }, 400);

    const format = String(params.format || 'png').toLowerCase();
    if (format !== 'png' && format !== 'svg') return jsonResponse({ success: false, error: "format 只能是 png 或 svg" }, 400);
    const size = Number(params.size ?? 400);
    if (!Number.isInteger(size) || size < 100 || size > 2000) return jsonResponse({ success: false, error: "size 需為 100~2000 的整數" }, 400);
    const margin = Number(params.margin ?? 4);
    if (!Number.isInteger(margin) || margin < 0 || margin > 20) return jsonResponse({ success: false, error: "margin 需為 0~20 的整數" }, 400);
    const ecc = String(params.ecc || 'M').toUpperCase();
    if (!ECC_LEVELS.includes(ecc)) return jsonResponse({ success: false, error: "ecc 只能是 L、M、Q、H" }, 400);

    let bytes, mimeType;
    if (format === 'svg') {
      bytes = new TextEncoder().encode(toSvg(data, { size, margin, ecc }));
      mimeType = 'image/svg+xml';
    } else {
      bytes = (await toPng(data, { size, margin, ecc })).bytes;
      mimeType = 'image/png';
    }

    const store = params.store;
    if (!store) {
      return new Response(bytes, {
        headers: { ...CORS_HEADERS, "Content-Type": mimeType, "Cache-Control": "public, max-age=3600" }
      });
    }

    // 轉存：目前只支援 webhook（由對方自行寫入 Drive 等位置）
    if (store.type !== 'webhook') return jsonResponse({ success: false, error: "store.type 目前只支援 webhook" }, 400);
    let target;
    try { target = new URL(store.url); } catch { return jsonResponse({ success: false, error: "store.url 不是有效網址" }, 400); }
    if (target.protocol !== 'https:' || !STORE_HOST_ALLOWLIST.includes(target.hostname)) {
      return jsonResponse({ success: false, error: `store.url 只允許 ${STORE_HOST_ALLOWLIST.join('、')}` }, 400);
    }
    const fileName = String(store.fileName || `qr_${Date.now()}.${format}`);

    const res = await fetch(target.toString(), {
      method: 'POST',
      headers: { "Content-Type": "text/plain;charset=UTF-8" }, // 避免 GAS 的預檢請求
      body: JSON.stringify({
        action: 'qrsave',
        token: store.token || '',
        folderId: store.folderId || '',
        fileName,
        mimeType,
        base64: bytesToBase64(bytes)
      }),
      redirect: 'follow'
    });
    const text = await res.text();
    let stored;
    try { stored = JSON.parse(text); } catch { stored = text.slice(0, 500); }
    if (!res.ok) return jsonResponse({ success: false, error: `轉存失敗,對方回應 ${res.status}`, stored }, 502);

    return jsonResponse({ success: true, format, bytes: bytes.length, fileName, stored });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
