import { randomBytes, randomUUID } from 'node:crypto'
import { refreshCodexCredential } from './refresh'
import { loadState, saveState } from './storage'
import type {
  AntigravitySessionFile,
  AppState,
  CodexSessionFile,
  ProxyAccountView,
  ProxyLogEntry,
  ProxyPoolAccount,
  ProxyPoolState,
  ProxyProvider,
  ProxyStrategy,
  ProxyView
} from '@/types'

// ── Constants ─────────────────────────────────────────────────────

export const CODEX_UPSTREAM_URL = 'https://chatgpt.com/backend-api/codex/responses'
/** Mirrors the Codex CLI so the ChatGPT backend accepts the call. */
const CODEX_USER_AGENT = 'codex-tui/0.135.0 (Mac OS 26.5.0; arm64) iTerm.app/3.6.10 (codex-tui; 0.135.0)'
const CODEX_ORIGINATOR = 'codex-tui'

const POOL_VERSION = 'builtin-2'
/** Refresh when the access token has less than this left. */
const TOKEN_REFRESH_MARGIN_MS = 60_000
export const DEFAULT_429_COOLDOWN_MS = 5 * 60_000
export const SERVER_ERROR_COOLDOWN_MS = 60_000
/** How many pool accounts one inbound request may burn through. */
const MAX_ATTEMPTS = 3
const LOG_BUFFER_SIZE = 50

// ── In-memory bits (survive Next dev reloads via globalThis) ──────

const mem = globalThis as typeof globalThis & {
  __proxyPoolCursor?: Record<string, number>
  __proxyPoolLogs?: ProxyLogEntry[]
  __proxyPoolLocks?: Map<string, Promise<void>>
}

const logs = (mem.__proxyPoolLogs ??= [])
const locks = (mem.__proxyPoolLocks ??= new Map())
const cursors = (mem.__proxyPoolCursor ??= {})

export function pushLog(entry: Omit<ProxyLogEntry, 'at'>): void {
  logs.unshift({ at: new Date().toISOString(), ...entry })
  if (logs.length > LOG_BUFFER_SIZE) logs.length = LOG_BUFFER_SIZE
}

export function getLogs(): ProxyLogEntry[] {
  return [...logs]
}

// ── Pool state ────────────────────────────────────────────────────

function defaultPool(): ProxyPoolState {
  return { apiKey: '', strategy: 'round-robin', accounts: [] }
}

/** Load pool state, generating (and persisting) the inbound key once. */
export async function getPool(state?: AppState): Promise<{ state: AppState; pool: ProxyPoolState }> {
  const s = state ?? (await loadState())
  if (!s.proxy) s.proxy = defaultPool()
  if (!s.proxy.apiKey) {
    s.proxy.apiKey = `cs-${randomBytes(24).toString('hex')}`
    await saveState(s)
  }
  // Backfill provider for accounts imported before Phase 2.
  for (const a of s.proxy.accounts) a.provider ??= 'codex'
  return { state: s, pool: s.proxy }
}

/** Serialize mutations per account so two requests don't double-refresh. */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((r) => (release = r))
  locks.set(key, prev.then(() => next))
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(key) === next) locks.delete(key)
  }
}

// ── Model → provider routing ──────────────────────────────────────

/** Models gpt-/codex- go to the Codex pool; gemini-/claude- to Antigravity. */
export function providerForModel(model: string): ProxyProvider | null {
  const m = model.toLowerCase()
  if (m.startsWith('gemini-') || m.startsWith('claude-')) return 'antigravity'
  if (m.startsWith('gpt-') || m.startsWith('codex')) return 'codex'
  return null
}

// ── Tokens ────────────────────────────────────────────────────────

/** Expiry (epoch ms) from a JWT payload; null when undecodable. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

function tokenFresh(account: ProxyPoolAccount): boolean {
  const exp = account.tokens.expiresAt ? Date.parse(account.tokens.expiresAt) : null
  return exp !== null && exp - Date.now() > TOKEN_REFRESH_MARGIN_MS
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ANTIGRAVITY_CLIENT_ID =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'
const ANTIGRAVITY_CLIENT_SECRET = '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'

/** Google OAuth refresh for Antigravity sessions (form POST, standard flow). */
async function refreshAntigravityToken(current: ProxyPoolAccount): Promise<void> {
  const form = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: current.tokens.refreshToken
  })
  let res: Response
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000)
    })
  } catch (err) {
    throw new PoolError(
      401,
      `Không gọi được máy chủ token Google: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new PoolError(401, `Refresh token Google thất bại (HTTP ${res.status}): ${raw.slice(0, 200)}`)
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new PoolError(401, 'Máy chủ Google không trả access token')
  current.tokens = {
    ...current.tokens,
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString()
  }
}

/** Codex OAuth refresh, reusing the switch flow's rotation handling. */
async function refreshCodexToken(current: ProxyPoolAccount): Promise<void> {
  const outcome = await refreshCodexCredential(
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: current.tokens.accessToken,
        refresh_token: current.tokens.refreshToken,
        id_token: current.tokens.idToken,
        account_id: current.accountId
      }
    })
  )
  if (!outcome.ok) throw new PoolError(401, outcome.message)
  if ('skipped' in outcome) throw new PoolError(401, 'Credential không phải OAuth session')

  const parsed = JSON.parse(outcome.content) as {
    tokens?: { access_token?: string; refresh_token?: string; id_token?: string }
  }
  if (!parsed.tokens?.access_token) throw new PoolError(401, 'Refresh không trả access token')
  const exp = jwtExpiry(parsed.tokens.access_token)
  current.tokens = {
    accessToken: parsed.tokens.access_token,
    refreshToken: parsed.tokens.refresh_token ?? current.tokens.refreshToken,
    idToken: parsed.tokens.id_token ?? current.tokens.idToken,
    expiresAt: exp ? new Date(exp).toISOString() : null
  }
}

/**
 * Mint a fresh token when the access token is nearly expired. Refresh tokens
 * rotate, so the new pair is persisted immediately — losing it would orphan
 * the account.
 */
export async function ensureFreshToken(state: AppState, account: ProxyPoolAccount): Promise<void> {
  if (tokenFresh(account)) return

  await withLock(`refresh:${account.id}`, async () => {
    // Another request may have refreshed while we waited.
    const current = state.proxy?.accounts.find((a) => a.id === account.id)
    if (!current || tokenFresh(current)) return

    try {
      if (current.provider === 'antigravity') await refreshAntigravityToken(current)
      else await refreshCodexToken(current)
    } catch (err) {
      current.status = 'dead'
      current.lastError = err instanceof Error ? err.message : String(err)
      await saveState(state)
      throw err
    }
    if (current.status === 'dead') current.status = 'active'
    await saveState(state)
  })
}

// ── Inbound auth ──────────────────────────────────────────────────

/** Bearer-key check for the /v1/* endpoints. */
export async function isValidProxyKey(req: Request): Promise<boolean> {
  const { pool } = await getPool()
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return token !== '' && token === pool.apiKey
}

// ── Import ────────────────────────────────────────────────────────

/** Add a session (Codex or Antigravity token storage) to the pool. */
export async function importSession(
  raw: unknown
): Promise<{ account: ProxyAccountView; duplicate: boolean }> {
  const file = raw as CodexSessionFile & AntigravitySessionFile
  if (!file?.access_token || !file?.refresh_token) {
    throw new Error('Session thiếu access_token/refresh_token')
  }
  const provider: ProxyProvider = file.type === 'antigravity' ? 'antigravity' : 'codex'
  const email = file.email?.trim() || 'không rõ'
  const accountId = (provider === 'antigravity' ? file.project_id : file.account_id)?.trim() ?? ''

  const { state, pool } = await getPool()
  const existing = pool.accounts.find((a) => a.provider === provider && a.email === email)
  const expiresAt =
    provider === 'antigravity'
      ? (file.expired ?? null)
      : (() => {
          const t = jwtExpiry(file.access_token ?? '')
          return t ? new Date(t).toISOString() : null
        })()
  const tokens = {
    accessToken: file.access_token,
    refreshToken: file.refresh_token,
    idToken: file.id_token,
    expiresAt
  }

  if (existing) {
    existing.tokens = tokens
    existing.accountId = accountId || existing.accountId
    if (existing.status === 'dead') existing.status = 'active'
    existing.lastError = null
    await saveState(state)
    return { account: toView(existing), duplicate: true }
  }

  const account: ProxyPoolAccount = {
    id: randomUUID(),
    provider,
    email,
    accountId,
    tokens,
    status: 'active',
    cooldownUntil: null,
    lastError: null,
    usage: { requests: 0, failed: 0, inputTokens: 0, outputTokens: 0 },
    addedAt: new Date().toISOString()
  }
  pool.accounts.push(account)
  await saveState(state)
  return { account: toView(account), duplicate: false }
}

// ── Monitoring views ──────────────────────────────────────────────

const toView = (a: ProxyPoolAccount): ProxyAccountView => ({
  id: a.id,
  provider: a.provider,
  email: a.email,
  status: a.status,
  cooldownUntil: a.cooldownUntil ?? null,
  lastError: a.lastError ?? null,
  tokenExpiresAt: a.tokens.expiresAt ?? null,
  usage: { ...a.usage }
})

export async function getProxyView(): Promise<ProxyView> {
  const { pool } = await getPool()
  reviveExpiredCooldowns(pool)
  return {
    running: true,
    version: POOL_VERSION,
    baseUrl: 'http://127.0.0.1:6677',
    strategy: pool.strategy,
    apiKey: pool.apiKey,
    accounts: pool.accounts.map(toView)
  }
}

export async function getUsageCounters() {
  const { pool } = await getPool()
  return {
    byAccount: Object.fromEntries(pool.accounts.map((a) => [a.id, { email: a.email, ...a.usage }]))
  }
}

export async function resetAccountCooldown(id: string): Promise<void> {
  const { state, pool } = await getPool()
  const account = pool.accounts.find((a) => a.id === id)
  if (!account) throw new Error('Không tìm thấy account')
  if (account.status !== 'active') account.status = 'active'
  account.cooldownUntil = null
  account.lastError = null
  await saveState(state)
}

export async function getStrategy(): Promise<{ strategy: ProxyStrategy }> {
  const { pool } = await getPool()
  return { strategy: pool.strategy }
}

export async function setStrategy(strategy: string): Promise<{ strategy: ProxyStrategy }> {
  if (strategy !== 'round-robin' && strategy !== 'fill-first') {
    throw new Error(`Chiến lược không hợp lệ: ${strategy}`)
  }
  const { state, pool } = await getPool()
  pool.strategy = strategy
  await saveState(state)
  return { strategy: pool.strategy }
}

/** Cooldowns that already expired flip back to active (in-memory view). */
function reviveExpiredCooldowns(pool: ProxyPoolState): void {
  const now = Date.now()
  for (const a of pool.accounts) {
    if (a.status === 'cooldown' && a.cooldownUntil && Date.parse(a.cooldownUntil) <= now) {
      a.status = 'active'
      a.cooldownUntil = null
    }
  }
}

// ── Shared scheduling helpers (used by both provider executors) ───

export class PoolError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number
  ) {
    super(message)
  }
}

export interface UpstreamOk {
  ok: true
  /** The upstream stream (SSE; buffering happens in the caller). */
  body: ReadableStream<Uint8Array>
  account: ProxyPoolAccount
  model: string
}

export interface UpstreamFail {
  ok: false
  status: number
  message: string
  retryAfterSeconds?: number
}

/** Record one finished upstream call in the log buffer and the counters. */
export function recordCall(
  state: AppState,
  account: ProxyPoolAccount,
  model: string,
  status: number,
  message: string,
  failed: boolean
): void {
  account.usage.requests += 1
  if (failed) account.usage.failed += 1
  pushLog({ provider: account.provider, account: account.email, model, status, message })
  // Counters are read-modify-write; concurrent requests can lose a tick —
  // acceptable for a local monitor.
  void saveState(state)
}

export interface CandidatePlan {
  state: AppState
  pool: ProxyPoolState
  attempts: ProxyPoolAccount[]
  fail?: UpstreamFail
}

/**
 * Pick up to MAX_ATTEMPTS active accounts of one provider, ordered by the
 * configured strategy (round-robin cursor is per provider).
 */
export async function planCandidates(provider: ProxyProvider): Promise<CandidatePlan> {
  const { state, pool } = await getPool()
  reviveExpiredCooldowns(pool)

  const usable = pool.accounts.filter((a) => a.provider === provider && a.status !== 'dead')
  let candidates = usable.filter((a) => a.status === 'active')
  if (candidates.length === 0) {
    const soonest = usable
      .map((a) => (a.cooldownUntil ? Date.parse(a.cooldownUntil) : Infinity))
      .sort((x, y) => x - y)[0]
    if (usable.length > 0 && Number.isFinite(soonest)) {
      return {
        state,
        pool,
        attempts: [],
        fail: {
          ok: false,
          status: 429,
          message: 'Tất cả account đang cooldown',
          retryAfterSeconds: Math.max(1, Math.ceil((soonest - Date.now()) / 1000))
        }
      }
    }
    return {
      state,
      pool,
      attempts: [],
      fail: { ok: false, status: 503, message: `Pool chưa có account ${provider} nào` }
    }
  }

  if (pool.strategy === 'round-robin') {
    // Advance one slot per call: successive calls start at successive
    // accounts, and failover within a call walks the rest of the ring.
    const cursor = (cursors[provider] ?? 0) % candidates.length
    candidates = [...candidates.slice(cursor), ...candidates.slice(0, cursor)]
    cursors[provider] = (cursors[provider] ?? 0) + 1
  }
  return { state, pool, attempts: candidates.slice(0, Math.min(MAX_ATTEMPTS, candidates.length)) }
}

/** Earliest cooldown end across the pool, for Retry-After on exhaustion. */
export function soonestCooldown(pool: ProxyPoolState, provider: ProxyProvider): number | null {
  const ends = pool.accounts
    .filter((a) => a.provider === provider && a.status === 'cooldown' && a.cooldownUntil)
    .map((a) => Date.parse(a.cooldownUntil!))
    .sort((x, y) => x - y)
  return ends.length > 0 ? ends[0] : null
}

export function markCooldown(
  account: ProxyPoolAccount,
  untilMs: number,
  message: string
): void {
  account.status = 'cooldown'
  account.cooldownUntil = new Date(untilMs).toISOString()
  account.lastError = message
}

export function markDead(account: ProxyPoolAccount, message: string): void {
  account.status = 'dead'
  account.lastError = message
}

// ── Codex executor ────────────────────────────────────────────────

function codexHeaders(account: ProxyPoolAccount): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${account.tokens.accessToken}`,
    'chatgpt-account-id': account.accountId,
    originator: CODEX_ORIGINATOR,
    'user-agent': CODEX_USER_AGENT,
    session_id: randomUUID(),
    accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental'
  }
}

// Params the ChatGPT Codex backend accepts; everything else (temperature,
// top_p, max_output_tokens, ...) is rejected with a 400, so strip it.
const CODEX_PARAM_WHITELIST = new Set([
  'model',
  'instructions',
  'input',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
  'reasoning',
  'include',
  'truncation',
  'text',
  'metadata',
  'prompt_cache_key'
])

interface UpstreamErrorBody {
  error?: {
    type?: string
    message?: string
    resets_at?: number
    resets_in_seconds?: number
  }
  detail?: string
}

export function errorMessage(status: number, body: UpstreamErrorBody | null, raw: string): string {
  return body?.error?.message ?? body?.detail ?? (raw ? raw.slice(0, 300) : `HTTP ${status}`)
}

/** 429 cooldown: resets_at (unix) wins, then resets_in_seconds, else 5 minutes. */
function codexCooldownFrom429(body: UpstreamErrorBody | null): number {
  const err = body?.error
  if (err?.resets_at && err.resets_at * 1000 > Date.now()) return err.resets_at * 1000
  if (err?.resets_in_seconds && err.resets_in_seconds > 0) {
    return Date.now() + err.resets_in_seconds * 1000
  }
  return Date.now() + DEFAULT_429_COOLDOWN_MS
}

/**
 * Run one Responses payload against the Codex pool. Client errors (other
 * 4xx) are returned verbatim — retrying them on another account would poison
 * the whole pool like it did with the model-not-supported error in testing.
 *
 * The upstream is always asked to stream; callers either pass the SSE
 * through or buffer it into the final response.completed payload.
 */
export async function executeCodex(
  payload: Record<string, unknown>,
  model: string
): Promise<UpstreamOk | UpstreamFail> {
  const { state, pool, attempts, fail } = await planCandidates('codex')
  if (fail) return fail

  let lastFail: UpstreamFail = { ok: false, status: 503, message: 'Không còn account để thử' }
  let sawCooldown = false

  for (const account of attempts) {
    try {
      await ensureFreshToken(state, account)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordCall(state, account, model, 401, message, true)
      lastFail = { ok: false, status: 401, message }
      continue
    }

    const body: Record<string, unknown> = { stream: true, store: false }
    for (const key of CODEX_PARAM_WHITELIST) {
      if (payload[key] !== undefined) body[key] = payload[key]
    }
    body.model = model
    if (body.instructions === undefined || body.instructions === null) body.instructions = ''
    // The backend rejects a bare-string input; normalize to a message list.
    if (typeof body.input === 'string') {
      body.input = [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: body.input }] }
      ]
    }

    let status: number
    let raw: string
    let res: Response
    try {
      res = await fetch(CODEX_UPSTREAM_URL, {
        method: 'POST',
        headers: codexHeaders(account),
        body: JSON.stringify(body)
      })
    } catch (err) {
      const message = `Không gọi được upstream: ${err instanceof Error ? err.message : String(err)}`
      markCooldown(account, Date.now() + SERVER_ERROR_COOLDOWN_MS, message)
      recordCall(state, account, model, 502, message, true)
      lastFail = { ok: false, status: 502, message }
      sawCooldown = true
      continue
    }

    if (res.ok && res.body) {
      recordCall(state, account, model, res.status, 'ok', false)
      return { ok: true, body: res.body, account, model }
    }

    status = res.status
    raw = await res.text().catch(() => '')
    let parsed: UpstreamErrorBody | null = null
    try {
      parsed = JSON.parse(raw) as UpstreamErrorBody
    } catch {
      parsed = null
    }

    if (status === 401) {
      // One forced refresh, one retry; still 401 means the session is dead.
      account.tokens.expiresAt = new Date(Date.now() - 1000).toISOString()
      try {
        await ensureFreshToken(state, account)
        const retry = await fetch(CODEX_UPSTREAM_URL, {
          method: 'POST',
          headers: codexHeaders(account),
          body: JSON.stringify(body)
        })
        if (retry.ok && retry.body) {
          recordCall(state, account, model, retry.status, 'ok (sau refresh)', false)
          return { ok: true, body: retry.body, account, model }
        }
        status = retry.status
        raw = await retry.text().catch(() => '')
        parsed = null
        try {
          parsed = JSON.parse(raw) as UpstreamErrorBody
        } catch {
          parsed = null
        }
        if (status === 401) {
          markDead(account, 'Session hết hạn — cần import lại session mới')
          recordCall(state, account, model, 401, account.lastError!, true)
          lastFail = { ok: false, status: 401, message: account.lastError! }
          continue
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        recordCall(state, account, model, 401, msg, true)
        lastFail = { ok: false, status: 401, message: msg }
        continue
      }
    }

    const message = errorMessage(status, parsed, raw)

    if (status === 429) {
      markCooldown(account, codexCooldownFrom429(parsed), message)
      recordCall(state, account, model, 429, message, true)
      lastFail = { ok: false, status: 429, message }
      sawCooldown = true
      continue
    }

    if (status >= 500) {
      markCooldown(account, Date.now() + SERVER_ERROR_COOLDOWN_MS, message)
      recordCall(state, account, model, status, message, true)
      lastFail = { ok: false, status, message }
      sawCooldown = true
      continue
    }

    // Other 4xx: a client error — return verbatim, do not burn the pool.
    recordCall(state, account, model, status, message, true)
    return { ok: false, status, message }
  }

  if (sawCooldown) {
    const soonest = soonestCooldown(pool, 'codex')
    if (soonest) {
      return { ...lastFail, retryAfterSeconds: Math.max(1, Math.ceil((soonest - Date.now()) / 1000)) }
    }
  }
  return lastFail
}

// ── Usage accounting ──────────────────────────────────────────────

/** Token usage from a response.completed payload; null when absent. */
export function extractUsage(completed: unknown): { input: number; output: number } | null {
  const usage = (completed as { response?: { usage?: { input_tokens?: number; output_tokens?: number } } })
    ?.response?.usage
  if (!usage) return null
  return { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }
}

/** Add token figures to an account's counters after a completed call. */
export async function addTokenUsage(
  accountId: string,
  usage: { input: number; output: number }
): Promise<void> {
  const { state, pool } = await getPool()
  const account = pool.accounts.find((a) => a.id === accountId)
  if (!account) return
  account.usage.inputTokens += usage.input
  account.usage.outputTokens += usage.output
  await saveState(state)
}
