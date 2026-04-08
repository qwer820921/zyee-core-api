export default {
  async fetch(request, env, ctx) {
    const UPSTASH_URL = env.UPSTASH_URL;
    const UPSTASH_TOKEN = env.UPSTASH_TOKEN;

    const redisCommand = ["SET", "test_key", "hello_world", "EX", 600];

    try {
      const response = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(redisCommand)
      });

      const result = await response.json();
      return new Response(`寫入測試結果: ${JSON.stringify(result)}`, {
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });
    } catch (error) {
      return new Response(`發生錯誤: ${error.message}`, { status: 500 });
    }
  },
};