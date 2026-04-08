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
      const resp = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command)
      });
      return await resp.json();
    };

    // 🌟 API 1: 產生隨機信箱
    if (url.pathname === '/api/create') {
      try {
        const domainResp = await fetch('https://api.mail.tm/domains');
        const domains = await domainResp.json();
        const domain = domains['hydra:member'][0].domain;

        const randomID = Math.random().toString(36).substring(2, 10);
        const email = `${randomID}@${domain}`;
        const password = Math.random().toString(36).substring(2, 15);

        const createAcc = await fetch('https://api.mail.tm/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: email, password: password })
        });

        if (!createAcc.ok) throw new Error("Mail.tm 帳號建立失敗");

        // 存入 Redis，預設 600 秒 (10分鐘)
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

    // 🌟 API 2: 檢查收件匣 (Proxy Mode)
    if (url.pathname === '/api/check') {
      const email = url.searchParams.get('email');
      if (!email) return new Response("Missing email", { status: 400, headers: CORS_HEADERS });

      const redisData = await runRedisCommand(["GET", email]);
      if (!redisData.result) {
        return new Response(JSON.stringify({ success: false, message: "信箱已過期" }), { headers: CORS_HEADERS });
      }
      const { password } = JSON.parse(redisData.result);

      try {
        // 登入拿 Token
        const tokenResp = await fetch('https://api.mail.tm/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: email, password: password })
        });
        const { token } = await tokenResp.json();

        // 拿信件列表
        const msgResp = await fetch('https://api.mail.tm/messages', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgResp.json();

        return new Response(JSON.stringify({ 
          success: true, 
          inbox: msgData['hydra:member'] 
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: "抓取失敗" }), { headers: CORS_HEADERS });
      }
    }

    // 🌟 API 3: 延長時間 (New!)
    if (url.pathname === '/api/extend') {
      const email = url.searchParams.get('email');
      if (!email) return new Response("Missing email", { status: 400, headers: CORS_HEADERS });

      // 將 Redis 中的 Key 重新設定為 600 秒 (從現在起加 10 分鐘)
      const result = await runRedisCommand(["EXPIRE", email, 600]);
      
      return new Response(JSON.stringify({ 
        success: result.result === 1, 
        message: result.result === 1 ? "已成功延長 10 分鐘" : "延長失敗，信箱可能已過期",
        expires_in: 600
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    return new Response("10mEmail System Active", { headers: CORS_HEADERS });
  },

  async scheduled(event, env, ctx) {
    await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(["GET", "keep-alive-ping"])
    });
  }
};
