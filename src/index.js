// 設定 CORS
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const UPSTASH_URL = env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

    // Redis 工具函數
    const runRedisCommand = async (command) => {
      const response = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command)
      });
      return await response.json();
    };

    // 🌟 API 1: 產生隨機信箱 (整合 Mail.tm)
    if (url.pathname === '/api/create') {
      try {
        // 1. 取得 Mail.tm 可用網域
        const domainResp = await fetch('https://api.mail.tm/domains');
        const domains = await domainResp.json();
        const domain = domains['hydra:member'][0].domain;

        // 2. 產生隨機帳密
        const randomID = Math.random().toString(36).substring(2, 10);
        const email = `${randomID}@${domain}`;
        const password = Math.random().toString(36).substring(2, 15); // 隨機強密碼

        // 3. 在 Mail.tm 建立帳號
        const createAcc = await fetch('https://api.mail.tm/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: email, password: password })
        });

        if (!createAcc.ok) throw new Error("Mail.tm 帳號建立失敗");

        // 4. 將帳密存入 Redis (10分鐘過期)，方便後續 check 時抓信
        await runRedisCommand(["SET", email, JSON.stringify({ password }), "EX", 600]);

        return new Response(JSON.stringify({ 
          success: true, 
          email: email, 
          expires_in: 600 
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500, headers: CORS_HEADERS
        });
      }
    }

    // 🌟 API 2: 檢查收件匣 (向 Mail.tm 代理抓信)
    if (url.pathname === '/api/check') {
      const email = url.searchParams.get('email');
      if (!email) {
        return new Response(JSON.stringify({ error: "請提供 email 參數" }), { 
          status: 400, headers: CORS_HEADERS 
        });
      }

      // 1. 從 Redis 拿回該信箱的密碼
      const redisData = await runRedisCommand(["GET", email]);
      if (!redisData.result) {
        return new Response(JSON.stringify({ success: false, message: "信箱已過期" }), { 
          headers: CORS_HEADERS 
        });
      }
      const { password } = JSON.parse(redisData.result);

      try {
        // 2. 登入 Mail.tm 取得 Token
        const tokenResp = await fetch('https://api.mail.tm/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: email, password: password })
        });
        const tokenData = await tokenResp.json();
        const token = tokenData.token;

        // 3. 抓取信件列表
        const msgResp = await fetch('https://api.mail.tm/messages', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgResp.json();

        return new Response(JSON.stringify({ 
          success: true, 
          inbox: msgData['hydra:member'] // Mail.tm 的信件陣列
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: "抓取郵件失敗" }), { 
          headers: CORS_HEADERS 
        });
      }
    }

    return new Response("10mEmail API System Running", { headers: CORS_HEADERS });
  },

  // 定時任務：喚醒 Upstash
  async scheduled(event, env, ctx) {
    await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(["GET", "keep-alive-ping"])
    });
  }
};