# AGENTS.md — zyee-core-api

> 本檔案定義 AI 助手在此專案中的開發規範與慣例。

---

## 1. 專案概覽

| 項目         | 說明                                                   |
| ------------ | ------------------------------------------------------ |
| **專案名稱** | zyee-core-api                                          |
| **類型**     | 後端 API 服務（子yee 萬事屋的核心 API）                |
| **執行環境** | Cloudflare Workers (Serverless Edge)                   |
| **語言**     | JavaScript (ES Modules)                                |
| **資料庫**   | Upstash Redis (REST API)                               |
| **部署方式** | `wrangler deploy`（Cloudflare CLI）                    |
| **前端對接** | https://qwer820921.github.io                           |
| **GitHub**   | https://github.com/qwer820921/zyee-core-api            |

---

## 2. 功能模組

### 📧 10 分鐘信箱 (`/api/mail/*`)

| 端點                       | 方法 | 說明                         |
| -------------------------- | ---- | ---------------------------- |
| `/api/mail/create`         | GET  | 產生隨機信箱（Mail.tm 註冊） |
| `/api/mail/check?email=`   | GET  | 檢查收件匣列表               |
| `/api/mail/extend?email=`  | GET  | 延長信箱 10 分鐘             |
| `/api/mail/message-detail` | GET  | 取得單封郵件完整內容         |

### ⬛ 動態 QR Code (`/api/qr/*`)

| 端點              | 方法 | 說明                          |
| ----------------- | ---- | ----------------------------- |
| `/api/qr/create`  | POST | 建立動態短網址（30 天有效）   |
| `/api/qr/update`  | POST | 更新短網址的真實目標          |
| `/q/:id`          | GET  | 掃描跳轉（302 Redirect）     |

### ⏰ 定時任務 (Cron Trigger)

- `0 0 * * *`（每天凌晨 00:00）：喚醒 Upstash Redis，防止 7 天自動封存

---

## 3. 技術棧規範

### 3.1 目錄結構

```
src/
├── index.js          # 主入口：路由分發 + Cron Handler
├── api/
│   ├── mail.js       # 10 分鐘信箱 API
│   └── qr.js         # 動態 QR Code API
└── utils/
    ├── cors.js       # CORS 標頭設定
    └── redis.js      # Upstash Redis REST 工具函式
```

### 3.2 開發慣例

- **ES Modules**：使用 `import/export` 語法，不使用 CommonJS (`require`)
- **環境變數**：透過 `env` 參數取得（Cloudflare Workers 標準模式），不使用 `process.env`
- **CORS**：所有 API 回應必須包含 `CORS_HEADERS`，統一從 `utils/cors.js` 引入
- **Redis**：所有 Redis 操作統一使用 `utils/redis.js` 的 `runRedisCommand`
- **錯誤處理**：每個 API 函式必須 try-catch，返回 JSON 格式的錯誤訊息

### 3.3 環境變數（Cloudflare Workers Secrets）

| 變數名                     | 用途                    |
| -------------------------- | ----------------------- |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST 端點 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis 認證 Token|

> ⚠️ 這些變數透過 `wrangler secret put` 設定，不會出現在程式碼中。

---

## 4. 部署指令

```bash
# 本地開發（模擬 Cloudflare Workers 環境）
npx wrangler dev

# 部署至 Cloudflare Workers（正式環境）
npx wrangler deploy

# 設定環境變數（Secret）
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN

# 查看即時日誌
npx wrangler tail
```

---

## 5. 新增 API 慣例

新增 API 端點時，遵循以下步驟：

1. 在 `src/api/` 下建立或修改對應的模組檔案
2. 函式使用 `export async function handleXxx(request, env)` 格式
3. 在 `src/index.js` 中新增路由對應
4. 確保回應包含 `CORS_HEADERS`
5. 錯誤回應使用 JSON 格式 `{ success: false, error: "訊息" }`

---

## 6. 注意事項

> ⚠️ **CORS 設定**：目前 `Access-Control-Allow-Origin` 設為 `"*"`（允許所有來源）。正式上線後建議改為 `"https://qwer820921.github.io"`。

> ⚠️ **Redis TTL**：信箱資料 TTL 為 600 秒（10 分鐘），QR Code 資料 TTL 為 2592000 秒（30 天）。QR Code 每次被掃描時會自動續命。

> ⚠️ **無 package.json**：此專案目前沒有 `package.json`，直接使用 Wrangler CLI 管理。如果未來需要引入第三方套件，需先執行 `npm init` 建立。
