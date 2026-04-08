/**
 * CORS (跨來源資源共用) 設定檔
 * 集中管理全站 API 的跨域權限
 */
export const CORS_HEADERS = {
  // 測試階段設為 "*" 允許所有來源。
  // 上線後建議改為你的前端網址，例如 "https://ericlien.github.io"
  "Access-Control-Allow-Origin": "*", 
  
  // 允許的請求方法 (GET 拿資料, POST 寫資料, OPTIONS 預檢請求)
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  
  // 允許前端攜帶的自訂標頭 (Authorization 用來傳 Token, Content-Type 用來傳 JSON)
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};