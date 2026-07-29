<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Built-in Codex proxy (replaces the old external CLIProxyAPI integration)

codex-switch serves OpenAI-compatible endpoints backed by a pool of Codex (ChatGPT OAuth) sessions it owns — no external proxy binary involved.

- `src/lib/proxy-pool.ts` — pool state (in AppState `proxy`: apiKey, strategy, accounts with provider/tokens/status/cooldown/usage counters), token refresh per provider (Codex via `refresh.ts`, Antigravity via Google oauth2 token endpoint; rotated pairs persisted immediately), round-robin/fill-first scheduler with failover (per-provider cursor, 429 → cooldown from upstream hints, 401 → one refresh+retry then dead, 5xx → 60s cooldown; other 4xx pass through WITHOUT cooling the pool). `providerForModel` routes gpt-/codex- → codex, gemini-/claude- → antigravity.
- `src/lib/proxy-antigravity.ts` — Antigravity executor: envelope `{model, userAgent, requestType, project, requestId, request}` POSTed to `cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse` (UA `antigravity/hub/2.2.1 darwin/arm64`), 429 RATE_LIMIT vs QUOTA_EXHAUSTED (retryDelay), 403 VALIDATION_REQUIRED → long cooldown + verify hint (never dead), Gemini→chat translation. Quirks: upstream SSE is CRLF and every chunk is wrapped in `{"response": {...}}`.
- `src/lib/proxy-translate.ts` — chat.completions ↔ Responses translation + SSE helpers (CRLF-tolerant). Upstream is always stream=true; non-stream clients get the buffered terminal payload. The ChatGPT backend rejects temperature/top_p/max_output_tokens (whitelist in proxy-pool) and leaves `output` empty in response.completed (items are patched from output_item.done events).
- Inbound: `POST /v1/responses`, `POST /v1/chat/completions` (stream + non-stream), `GET /v1/models` — all require `Authorization: Bearer <proxy.apiKey>` (auto-generated `cs-…`, visible in the Proxy tab).
- Monitoring: `GET /api/proxy/status|usage|logs|routing` (+ `PUT routing`), `POST /api/proxy/accounts/reset-quota` (body `{id}`), `POST /api/proxy/import` (CodexTokenStorage JSON).
- Tests can point the app at another state dir via `CODEX_SWITCH_DATA_DIR`.
