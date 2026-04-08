// 設定 CORS，允許你的 GitHub Pages 前端來呼叫這支 API
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // 測試階段先允許所有來源，上線後可改成你的 GitHub Pages 網址
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    // 處理瀏覽器的 CORS 預檢請求 (Preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const UPSTASH_URL = env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

    // 建立一個小工具函數，專門用來打 Upstash API
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

    // 🌟 API 1: 產生隨機信箱 (/api/create)
    if (url.pathname === '/api/create') {
      // 產生 8 碼隨機英數字
      const randomString = Math.random().toString(36).substring(2, 10);
      // 暫時先用一個假網域測試，之後接上 Email 服務再換掉
      const emailAddress = `${randomString}@demo-mail.com`; 
      
      // 在 Redis 建立這個信箱，初始內容為空陣列 "[]"，並設定 600 秒 (10分鐘) 後銷毀
      await runRedisCommand(["SET", emailAddress, "[]", "EX", 600]);

      return new Response(JSON.stringify({ 
        success: true, 
        email: emailAddress, 
        expires_in: 600 
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // 🌟 API 2: 檢查收件匣 (/api/check?email=xxx)
    if (url.pathname === '/api/check') {
      // 從網址列取得 email 參數
      const email = url.searchParams.get('email');
      if (!email) {
        return new Response(JSON.stringify({ error: "請提供 email 參數" }), { 
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
        });
      }

      // 去 Redis 查詢這個信箱的內容
      const data = await runRedisCommand(["GET", email]);
      
      // 如果 Redis 回傳 null，代表信箱已經過期被銷毀了，或者根本沒建立
      if (!data.result) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: "信箱已過期或不存在", 
          inbox: [] 
        }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        inbox: JSON.parse(data.result) 
      }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // 如果輸入了錯誤的網址路徑，顯示歡迎畫面
    return new Response("歡迎來到臨時信箱 API 系統！", { 
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain;charset=UTF-8" } 
    });
  },

  // 定時任務邏輯 (為了讓 Upstash 不會因為 7 天沒有連線而封存)
  async scheduled(event, env, ctx) {
    const UPSTASH_URL = env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

    console.log("正在執行 Upstash 喚醒任務...");

    try {
      // 隨便讀取一個不存在的 Key，只要有連線動作就能重置 Upstash 的 7 天計時器
      const response = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(["GET", "keep-alive-ping"])
      });

      const result = await response.json();
      console.log("喚醒成功:", JSON.stringify(result));
    } catch (error) {
      console.error("喚醒失敗:", error.message);
    }
  }
};