# Tiến độ: Proxy đa tài khoản tự xây trong codex-switch

Cập nhật: 2026-07-29. Tài liệu này mô tả đã làm gì, chưa làm gì, để pull về máy khác làm tiếp.

## Bối cảnh

Mục tiêu: hệ thống tự điều phối nhiều tài khoản AI (4 Codex/ChatGPT + 2 Google Antigravity) qua một API duy nhất, khỏi switch account thủ công.

Đã đi qua 2 giai đoạn:

1. **Dùng CLIProxyAPI** (phần mềm ngoài, Go) — chạy tốt nhưng phụ thuộc bên thứ ba. Đã xóa hoàn toàn.
2. **Tự xây proxy ngay trong codex-switch** (hiện tại) — toàn bộ cơ chế proxy sống trong Next.js server ở `127.0.0.1:6677`, không cần cài gì thêm.

## Đã làm xong

### Phase 1 — Pool Codex (OpenAI-compatible)
- `src/lib/proxy-pool.ts` — pool account trong `AppState` (state.json), tách biệt khỏi profiles switch tay:
  - Refresh token rotation-safe (tái dùng `refresh.ts`), lock chống double-refresh
  - Scheduler round-robin / fill-first, failover tối đa 3 acc
  - 429 → cooldown theo `resets_at` của OpenAI; 401 → refresh + retry 1 lần → dead; 5xx → cooldown 60s
  - Ring buffer 50 request log; counters request/token per acc
- `src/lib/proxy-translate.ts` — dịch chat.completions ↔ Responses (kể cả tool calls), SSE parse/re-chunk
- Inbound API chuẩn OpenAI ngay trên server 6677:
  - `POST /v1/responses` (stream SSE passthrough — dùng được cho codex CLI)
  - `POST /v1/chat/completions` (stream + non-stream)
  - `GET /v1/models`
  - Auth: `Authorization: Bearer cs-...` (key trong state, xem tab Proxy)
- Quirk đã xử lý: upstream ChatGPT luôn stream; `output: []` trong `response.completed` (phải ghép từ `response.output_item.done`); backend từ chối `temperature`/`top_p`/`max_output_tokens` (bỏ qua); 4xx không phải 429 trả verbatim, KHÔNG cooldown acc.

### Phase 2 — Pool Antigravity (Google)
- `src/lib/proxy-antigravity.ts` — executor gọi `cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`:
  - Envelope bắt buộc `{model, userAgent:"antigravity", requestType:"agent", project, requestId, request:{...}}`
  - Dịch chat.completions → Gemini contents (system→systemInstruction, tool_calls→functionCall...)
  - Phân loại lỗi: 429 RATE_LIMIT → cooldown ngắn + failover; QUOTA_EXHAUSTED → cooldown theo `retryDelay`; 403 VALIDATION_REQUIRED → error 6h + message hướng dẫn verify (không dead vĩnh viễn)
- Pool provider-aware: `gpt-*`/`codex-*` → codex, `gemini-*`/`claude-*` → antigravity; round-robin riêng từng provider
- Refresh Google OAuth qua `oauth2.googleapis.com/token` (client id/secret của Antigravity, public)
- Quirk đã xử lý: SSE của Google dùng CRLF; mỗi chunk bọc trong `{"response":{...},"traceId"}`; envelope thiếu `project`/`requestId`/`sessionId` là bị từ chối; bug cursor round-robin tăng sai khi pool 2 acc.

### Quản trị & UI
- Tab **Proxy** trong dashboard: trạng thái 6 acc (provider badge, cooldown đến mấy giờ, lý do lỗi), nút xóa cooldown, counters request/token, nhật ký request, dropdown chiến lược điều phối, hiển thị base URL + API key (hiện/ẩn).
- API quản trị: `/api/proxy/{status,usage,logs,routing,import,accounts/reset-quota}`.
- Đã import + verify thật trên production: 6 acc active, gọi thật `gpt-5.4-mini`, `gemini-3-flash`, `claude-sonnet-4-6` đều OK, round-robin đúng.

## Thông số vận hành (máy hiện tại)

```
Base URL: http://127.0.0.1:6677/v1
API key:  xem trong tab Proxy (state.json, dạng cs-...)
```

6 session account nằm trong `~/.codex-switch/state.json` (mục `proxy`). Bản backup gốc ở `~/.codex-switch/proxy-import/*.json` (format CodexTokenStorage / AntigravityTokenStorage của CLIProxyAPI) — import lại bằng:

```bash
for f in ~/.codex-switch/proxy-import/*.json; do
  curl -X POST http://127.0.0.1:6677/api/proxy/import \
    -H 'content-type: application/json' -d @"$f"
done
```

## Chưa làm / TODO

- [ ] `POST /v1/messages` (format Claude nguyên bản) — cần để đấu Claude Code thẳng vào pool (`ANTHROPIC_BASE_URL`)
- [ ] Thinking signature replay cho multi-turn reasoning (model `*-thinking`); single-turn đã OK
- [ ] UI import/xóa account khỏi pool (hiện chỉ có qua API `/api/proxy/import`)
- [ ] Image input; `maxOutputTokens` mapping cho Antigravity
- [ ] Model catalog động (hiện list static trong `/v1/models`)
- [ ] Race nhẹ giữa `record()` và `addTokenUsage()` khi ghi counters (cần queue/lock ghi state)
- [ ] Menubar Swift chưa hiển thị trạng thái proxy pool
- [ ] Test function calling với tool thật (code đã hỗ trợ cơ bản)

## Lưu ý khi pull về máy khác

1. `state.json` (chứa 6 session + API key) **không nằm trong git** — máy mới phải copy `~/.codex-switch/proxy-import/` từ máy này sang rồi chạy lệnh import ở trên, hoặc login lại từng acc.
2. Session proxy là session **riêng** — không dùng chung refresh token với profile switch tay của cùng một tài khoản (rotation sẽ giết nhau).
3. Server chạy qua LaunchAgent `local.codexswitch.server` (`scripts/autostart.sh`); sau khi pull code mới cần `npm run build` + `launchctl kickstart -k gui/$(id -u)/local.codexswitch.server`.
4. Acc Antigravity có nguy cơ Google bắt verify (403 VALIDATION_REQUIRED) — mở link trong `status_message` bằng đúng acc đó để xác minh, rồi bấm "Xoá cooldown" trong tab Proxy.
5. Source Go tham khảo của CLIProxyAPI (nếu cần đọc lại quirk giao thức): `git clone --depth 1 https://github.com/router-for-me/CLIProxyAPI` — không cần chạy.
