import { CORS_HEADERS } from '../utils/cors.js';
import { runRedisCommand } from '../utils/redis.js';

/**
 * 🌟 API 1: 產生隨機信箱
 * 流程：抓取可用網域 -> 產生帳密 -> 向 Mail.tm 註冊 -> 存入 Redis 並設定 10 分鐘過期
 */
export async function handleCreateMail(request, env) {
  try {
    // 取得 Mail.tm 當前可用的域名列表
    const domainResp = await fetch('https://api.mail.tm/domains');
    const domains = await domainResp.json();
    const domain = domains['hydra:member'][0].domain;

    // 產生隨機 8 位字元 ID 與 13 位字元密碼
    const randomID = Math.random().toString(36).substring(2, 10);
    const email = `${randomID}@${domain}`;
    const password = Math.random().toString(36).substring(2, 15);

    // 向 Mail.tm 註冊新帳號
    const createAcc = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password: password })
    });

    if (!createAcc.ok) throw new Error("Mail.tm 帳號註冊失敗");

    // 將帳密存入 Redis，Key 為 Email 地址，過期時間 (EX) 設定為 600 秒
    await runRedisCommand(env, ["SET", email, JSON.stringify({ password }), "EX", 600]);

    return new Response(JSON.stringify({ 
      success: true, 
      email: email, 
      expires_in: 600 
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
}

/**
 * 🌟 API 2: 檢查收件匣 (列表模式)
 * 流程：從 Redis 讀取密碼 -> 向 Mail.tm 拿 Token -> 抓取郵件摘要列表
 */
export async function handleCheckMail(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response("Missing email", { status: 400, headers: CORS_HEADERS });

  // 從 Redis 抓取密碼以進行驗證
  const redisData = await runRedisCommand(env, ["GET", email]);
  if (!redisData.result) {
    return new Response(JSON.stringify({ success: false, message: "信箱已過期" }), { 
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  }
  const { password } = JSON.parse(redisData.result);

  try {
    // 登入 Mail.tm 取得 JWT Token
    const tokenResp = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password: password })
    });
    const { token } = await tokenResp.json();

    // 獲得信件摘要列表 (列表預設只提供摘要 intro)
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
    return new Response(JSON.stringify({ success: false, error: "抓取清單失敗" }), { 
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  }
}

/**
 * 🌟 API 3: 延長信箱時間
 * 流程：前端按鈕觸發 -> Redis 重設 EXPIRE 時間為 600 秒
 */
export async function handleExtendMail(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) return new Response("Missing email", { status: 400, headers: CORS_HEADERS });

  // 使用 Redis EXPIRE 指令重設生命值
  const result = await runRedisCommand(env, ["EXPIRE", email, 600]);
  
  return new Response(JSON.stringify({ 
    success: result.result === 1, 
    message: result.result === 1 ? "已成功延長 10 分鐘" : "延長失敗，信箱可能已過期",
    expires_in: 600
  }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

/**
 * 🌟 API 4: 取得單封郵件詳情 (內容模式)
 * 流程：傳入信件 ID -> 登入拿 Token -> 抓取完整 HTML/Text 內容
 */
export async function handleMessageDetail(request, env) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  const msgId = url.searchParams.get('id');
  if (!email || !msgId) return new Response("Missing params", { status: 400, headers: CORS_HEADERS });

  const redisData = await runRedisCommand(env, ["GET", email]);
  if (!redisData.result) return new Response(JSON.stringify({ success: false }), { 
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
  });
  const { password } = JSON.parse(redisData.result);

  try {
    const tokenResp = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password: password })
    });
    const { token } = await tokenResp.json();

    // 呼叫 Mail.tm 單一訊息詳情接口
    const msgResp = await fetch(`https://api.mail.tm/messages/${msgId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const fullMsg = await msgResp.json();

    return new Response(JSON.stringify({ 
      success: true, 
      message: fullMsg 
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "抓取詳情失敗" }), { 
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } 
    });
  }
}