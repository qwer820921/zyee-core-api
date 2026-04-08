import { CORS_HEADERS } from '../utils/cors.js';
import { runRedisCommand } from '../utils/redis.js';

// 設定基礎存活時間：30 天 (換算成秒數)
const TTL_SECONDS = 30 * 24 * 60 * 60; // 2592000

// ==========================================
// ⬛ API 1: 建立動態 QR Code 短網址 (/api/qr/create)
// ==========================================
export async function handleCreateQR(request, env) {
  try {
    const body = await request.json();
    const targetUrl = body.url;

    if (!targetUrl || !targetUrl.startsWith('http')) {
      return new Response(JSON.stringify({ error: "請提供有效的 http/https 網址" }), { 
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      });
    }

    // 產生 6 碼隨機短 ID (例如: a1b2c3)
    const shortId = Math.random().toString(36).substring(2, 8); 
    
    // 存入 Redis，並設定 30 天過期
    // 資料結構：Key 為 "qr:短ID"，Value 為 "真實網址"
    await runRedisCommand(env, ["SET", `qr:${shortId}`, targetUrl, "EX", TTL_SECONDS]);
    
    // 建立統計資料，並設定同樣的過期時間
    await runRedisCommand(env, ["SET", `stats:qr:${shortId}`, 0, "EX", TTL_SECONDS]);

    const url = new URL(request.url);
    const shortUrl = `https://${url.hostname}/q/${shortId}`;

    return new Response(JSON.stringify({ 
      success: true, 
      shortId: shortId,
      shortUrl: shortUrl,
      expires_in_days: 30
    }), { 
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
}

// ==========================================
// ⬛ API 2: 掃描跳轉機制與自動續命 (/q/:id)
// ==========================================
export async function handleRedirectQR(request, env, ctx) {
  try {
    const url = new URL(request.url);
    // 從網址 /q/x8y9z 中提取出 "x8y9z"
    const shortId = url.pathname.split('/')[2]; 
    
    if (!shortId) {
      return new Response("無效的 QR Code 連結", { status: 400 });
    }

    // 去 Redis 查出真實網址
    const data = await runRedisCommand(env, ["GET", `qr:${shortId}`]);
    const realUrl = data.result;

    if (realUrl) {
      // 在背景執行「增加次數」與「重設 30 天壽命」，不阻擋跳轉
      ctx.waitUntil(Promise.all([
        runRedisCommand(env, ["INCR", `stats:qr:${shortId}`]),
        runRedisCommand(env, ["EXPIRE", `qr:${shortId}`, TTL_SECONDS]),
        runRedisCommand(env, ["EXPIRE", `stats:qr:${shortId}`, TTL_SECONDS])
      ]));
      
      // 執行 302 重新導向！
      return Response.redirect(realUrl, 302);
    } else {
      return new Response("找不到此 QR Code 連結，可能已超過 30 天未活動而被系統回收", { 
        status: 404, 
        headers: { "Content-Type": "text/plain;charset=UTF-8" } 
      });
    }
  } catch (err) {
    return new Response("系統發生錯誤", { status: 500 });
  }
}

// ==========================================
// ⬛ API 3: 更新動態碼的真實網址 (/api/qr/update)
// ==========================================
export async function handleUpdateQR(request, env) {
  try {
    const body = await request.json();
    const { shortId, newUrl } = body;

    if (!shortId || !newUrl || !newUrl.startsWith('http')) {
      return new Response(JSON.stringify({ error: "參數錯誤" }), { 
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      });
    }

    // 檢查這個 QR Code 存不存在
    const exists = await runRedisCommand(env, ["EXISTS", `qr:${shortId}`]);
    if (exists.result === 0) {
      return new Response(JSON.stringify({ error: "找不到指定的 QR Code，可能已過期" }), { 
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
      });
    }

    // 覆寫 Redis 裡面的真實網址，並直接幫他續命 30 天
    await runRedisCommand(env, ["SET", `qr:${shortId}`, newUrl, "EX", TTL_SECONDS]);

    return new Response(JSON.stringify({ 
      success: true, 
      message: "網址更新成功！現有的 QR Code 圖案不需更換即可生效。"
    }), { 
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
}