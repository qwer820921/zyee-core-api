/**
 * Redis 資料庫連線工具 (Upstash REST API)
 * 負責將指令發送至 Upstash 並回傳結果
 */
export const runRedisCommand = async (env, command) => {
  try {
    const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // 將傳入的陣列轉為 JSON 格式發送，例如 ["GET", "myKey"]
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`Upstash API 錯誤，狀態碼: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Redis 執行失敗:", error.message);
    // 將錯誤往上拋，讓呼叫這支工具的 API (如 mail.js 或 qr.js) 可以做錯誤處理
    throw error; 
  }
};