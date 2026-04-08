import { CORS_HEADERS } from './utils/cors.js';
import * as MailApi from './api/mail.js';
import * as QrApi from './api/qr.js';

export default {
  async fetch(request, env, ctx) {
    // 1. 處理瀏覽器的 CORS 預檢請求 (Preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ==========================================
    // 📧 區塊 A: 10 分鐘信箱路由
    // ==========================================
    // 將信箱功能統一放在 /api/mail/ 底下
    if (url.pathname === '/api/mail/create') {
      return await MailApi.handleCreateMail(request, env);
    }
    if (url.pathname === '/api/mail/check') {
      return await MailApi.handleCheckMail(request, env);
    }
    if (url.pathname === '/api/mail/extend') {
      return await MailApi.handleExtendMail(request, env);
    }
    if (url.pathname === '/api/mail/message-detail') {
      return await MailApi.handleMessageDetail(request, env);
    }

    // ==========================================
    // ⬛ 區塊 B: 動態 QR Code 路由
    // ==========================================
    // 產生動態碼 (POST)
    if (url.pathname === '/api/qr/create' && request.method === 'POST') {
      return await QrApi.handleCreateQR(request, env);
    }
    // 更新動態碼的真實網址 (POST)
    if (url.pathname === '/api/qr/update' && request.method === 'POST') {
      return await QrApi.handleUpdateQR(request, env);
    }
    // 掃描跳轉短網址 (例如掃描後會前往 /q/x8y9z)
    if (url.pathname.startsWith('/q/')) {
      return await QrApi.handleRedirectQR(request, env, ctx);
    }

    // ==========================================
    // 🏠 區塊 C: 預設首頁與錯誤處理
    // ==========================================
    return new Response(
      "歡迎來到 子yee 萬事屋 Core API 系統 🚀\n\n- 📧 Mail API: Active\n- ⬛ QR API: Active", 
      { headers: { ...CORS_HEADERS, "Content-Type": "text/plain;charset=UTF-8" } }
    );
  },

  // ==========================================
  // ⏰ 區塊 D: 定時任務 (Upstash 防休眠喚醒)
  // ==========================================
  async scheduled(event, env, ctx) {
    console.log("正在執行 Upstash 喚醒任務...");
    try {
      await fetch(env.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(["GET", "keep-alive-ping"])
      });
      console.log("喚醒成功");
    } catch (error) {
      console.error("喚醒失敗:", error.message);
    }
  }
};