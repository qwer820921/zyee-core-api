---
name: Cloudflare Workers 部署
description: zyee-core-api 的 Cloudflare Workers 開發與部署指南，涵蓋本地開發、正式部署、環境變數管理與常見問題排除
---

# Cloudflare Workers 部署

本專案使用 Cloudflare Workers 作為 Serverless 執行環境，透過 Wrangler CLI 進行開發與部署。

---

## 1. 架構概覽

```
使用者（瀏覽器 / 手機）
  │
  └─→ https://zyee-core-api.xxxxx.workers.dev
       │
       ├── /api/mail/*   → Mail.tm API（外部）
       ├── /api/qr/*     → Upstash Redis（外部）
       ├── /q/:id        → 302 重導向
       └── Cron Trigger  → 每日喚醒 Redis
                              │
                              ▼
                        Upstash Redis
                        （雲端 Key-Value 資料庫）
```

---

## 2. 本地開發

### 前置需求

- Node.js 18+
- Wrangler CLI（`npm install -g wrangler` 或使用 `npx`）
- 已登入 Cloudflare 帳戶（`wrangler login`）

### 啟動本地開發伺服器

```bash
# 啟動模擬環境（預設 http://localhost:8787）
npx wrangler dev

# 指定 Port
npx wrangler dev --port 8788

# 使用遠端資源（連接真實 Secrets，適合測試 Redis）
npx wrangler dev --remote
```

### `--local` vs `--remote`

| 模式 | 說明 |
|------|------|
| `--local`（預設） | 在本機模擬 Workers 環境，**無法存取 Secrets**，適合測試路由邏輯 |
| `--remote` | 連接 Cloudflare 真實環境，可存取 Secrets（Redis Token 等），適合端對端測試 |

---

## 3. 部署至正式環境

```bash
# 一鍵部署（上傳程式碼至 Cloudflare Edge 網路）
npx wrangler deploy
```

部署後會輸出 Worker 的 URL，例如：
```
https://zyee-core-api.qwer820921.workers.dev
```

---

## 4. 環境變數（Secrets）管理

### 設定 Secret

```bash
# 互動式輸入（推薦，密碼不會顯示在終端機）
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN

# 列出所有已設定的 Secrets
npx wrangler secret list
```

### 程式碼中使用

```javascript
// ✅ 正確：透過 env 參數取得
export default {
  async fetch(request, env) {
    const url = env.UPSTASH_REDIS_REST_URL;
  }
}

// ❌ 錯誤：Cloudflare Workers 中不存在 process.env
const url = process.env.UPSTASH_REDIS_REST_URL;
```

---

## 5. 日誌與除錯

```bash
# 即時查看正式環境的 console.log 輸出
npx wrangler tail

# 過濾特定狀態碼
npx wrangler tail --status error
```

---

## 6. wrangler.toml 設定說明

```toml
name = "zyee-core-api"               # Worker 名稱（影響 URL）
main = "src/index.js"                 # 入口檔案
compatibility_date = "2024-04-08"     # Workers Runtime 版本

[triggers]
crons = ["0 0 * * *"]                # 每天凌晨執行 scheduled()
```

---

## 7. 常見問題

### Q: 部署後 API 回傳 500 錯誤

```bash
# 檢查日誌
npx wrangler tail

# 常見原因：Secret 未設定
npx wrangler secret list
```

### Q: 本地測試 Redis 連線失敗

```bash
# 本地模式無法存取 Secrets，改用 --remote
npx wrangler dev --remote
```

### Q: 如何測試 Cron Trigger

```bash
# 本地開發模式下，手動觸發 Cron
curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"
```

### Q: 如何回滾至上一版

```bash
# Cloudflare Dashboard → Workers → zyee-core-api → Deployments → 選擇版本 → Rollback
# 或重新推送舊版程式碼
git checkout <commit-hash>
npx wrangler deploy
```

---

## 8. 注意事項

> ⚠️ **免費額度**：Cloudflare Workers Free Plan 每天 100,000 次請求，對個人專案綽綽有餘。

> ⚠️ **執行時間限制**：每次請求最長 10ms CPU Time（Free）或 30s（Paid）。目前的 API 都是 IO-bound（等待外部 API 回應），不受 CPU Time 限制。

> ⚠️ **不要把 Secret 寫在 wrangler.toml 中**。`wrangler.toml` 會被 Git 追蹤，Secret 必須透過 `wrangler secret put` 設定。
