import { randomUUID } from 'node:crypto'
import {
  DEFAULT_429_COOLDOWN_MS,
  ensureFreshToken,
  markCooldown,
  markDead,
  planCandidates,
  recordCall,
  SERVER_ERROR_COOLDOWN_MS,
  soonestCooldown,
  type UpstreamFail,
  type UpstreamOk
} from './proxy-pool'
import { consumeSse } from './proxy-translate'

// ── Constants (from CLIProxyAPI's antigravity executor) ───────────

const UPSTREAM_URL = 'https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse'
const USER_AGENT = 'antigravity/hub/2.2.1 darwin/arm64'
/** 403 VALIDATION_REQUIRED is a verification gate, not a dead session. */
const VALIDATION_COOLDOWN_MS = 6 * 3_600_000

// ── chat.completions → Gemini generateContent ────────────────────

interface ChatMessage {
  role: string
  content?: unknown
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : ((part as { text?: string })?.text ?? ''))).join('')
  }
  return ''
}

/** Translate a chat.completions body into the Antigravity request envelope. */
export function chatToAntigravity(
  body: Record<string, unknown>,
  model: string,
  projectId: string
): Record<string, unknown> {
  const messages = (body.messages ?? []) as ChatMessage[]
  const system: string[] = []
  const contents: Record<string, unknown>[] = []

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text = messageText(msg.content)
      if (text) system.push(text)
      continue
    }
    if (msg.role === 'assistant') {
      const parts: Record<string, unknown>[] = []
      const text = messageText(msg.content)
      if (text) parts.push({ text })
      for (const call of msg.tool_calls ?? []) {
        let args: unknown = {}
        try {
          args = JSON.parse(call.function?.arguments ?? '{}')
        } catch {
          args = {}
        }
        parts.push({ functionCall: { name: call.function?.name, args } })
      }
      if (parts.length > 0) contents.push({ role: 'model', parts })
      continue
    }
    if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.tool_call_id,
              response: { result: messageText(msg.content) }
            }
          }
        ]
      })
      continue
    }
    contents.push({ role: 'user', parts: [{ text: messageText(msg.content) }] })
  }

  const request: Record<string, unknown> = { contents, sessionId: randomUUID() }
  if (system.length > 0) {
    request.systemInstruction = { parts: [{ text: system.join('\n\n') }] }
  }
  if (Array.isArray(body.tools)) {
    const declarations = (body.tools as Record<string, unknown>[])
      .filter((t) => t.type === 'function' && typeof t.function === 'object' && t.function)
      .map((t) => {
        const fn = t.function as Record<string, unknown>
        return { name: fn.name, description: fn.description, parameters: fn.parameters }
      })
    if (declarations.length > 0) request.tools = [{ functionDeclarations: declarations }]
  }

  // The envelope shape the v1internal endpoint expects.
  return {
    model,
    userAgent: 'antigravity',
    requestType: 'agent',
    project: projectId,
    requestId: `agent-${randomUUID()}`,
    request
  }
}

// ── Error classification ─────────────────────────────────────────

interface GoogleErrorBody {
  error?: {
    code?: number
    status?: string
    message?: string
    details?: { '@type'?: string; reason?: string; retryDelay?: string }[]
  }
}

/** "3600s" / "1.5s" → ms; null when absent. */
function parseRetryDelay(body: GoogleErrorBody | null): number | null {
  for (const d of body?.error?.details ?? []) {
    if (d['@type']?.endsWith('RetryInfo') && d.retryDelay) {
      const seconds = Number(d.retryDelay.replace(/s$/, ''))
      if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000)
    }
  }
  return null
}

function errorReason(body: GoogleErrorBody | null): string {
  for (const d of body?.error?.details ?? []) {
    if (d['@type']?.endsWith('ErrorInfo') && d.reason) return d.reason
  }
  return ''
}

function googleErrorMessage(status: number, body: GoogleErrorBody | null, raw: string): string {
  return body?.error?.message ?? (raw ? raw.slice(0, 300) : `HTTP ${status}`)
}

// ── Executor ──────────────────────────────────────────────────────

/**
 * Run one Antigravity envelope against the antigravity pool. Mirrors the
 * reference executor's decisions: RATE_LIMIT → short cooldown + failover,
 * QUOTA_EXHAUSTED → cooldown by retryDelay, 403 VALIDATION_REQUIRED → long
 * cooldown with a verify hint (not dead), 401 → one refresh + retry.
 */
export async function executeAntigravity(
  chatBody: Record<string, unknown>,
  model: string
): Promise<UpstreamOk | UpstreamFail> {
  const { state, pool, attempts, fail } = await planCandidates('antigravity')
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

    const body = chatToAntigravity(chatBody, model, account.accountId)
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${account.tokens.accessToken}`,
      'user-agent': USER_AGENT
    }

    let status: number
    let raw: string
    let res: Response
    try {
      res = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers,
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
    let parsed: GoogleErrorBody | null = null
    try {
      parsed = JSON.parse(raw) as GoogleErrorBody
    } catch {
      parsed = null
    }

    if (status === 401) {
      account.tokens.expiresAt = new Date(Date.now() - 1000).toISOString()
      try {
        await ensureFreshToken(state, account)
        const retry = await fetch(UPSTREAM_URL, {
          method: 'POST',
          headers: { ...headers, authorization: `Bearer ${account.tokens.accessToken}` },
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
          parsed = JSON.parse(raw) as GoogleErrorBody
        } catch {
          parsed = null
        }
        if (status === 401) {
          markDead(account, 'Session Google hết hạn — cần import lại session mới')
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

    const message = googleErrorMessage(status, parsed, raw)

    if (status === 429) {
      const reason = errorReason(parsed)
      const retryDelay = parseRetryDelay(parsed)
      const cooldownMs =
        reason === 'RATE_LIMIT_EXCEEDED'
          ? Math.min(retryDelay ?? SERVER_ERROR_COOLDOWN_MS, DEFAULT_429_COOLDOWN_MS)
          : (retryDelay ?? DEFAULT_429_COOLDOWN_MS)
      markCooldown(account, Date.now() + cooldownMs, `${reason || 'RESOURCE_EXHAUSTED'}: ${message}`)
      recordCall(state, account, model, 429, message, true)
      lastFail = { ok: false, status: 429, message }
      sawCooldown = true
      continue
    }

    if (status === 403 && raw.includes('VALIDATION_REQUIRED')) {
      markCooldown(
        account,
        Date.now() + VALIDATION_COOLDOWN_MS,
        'Google yêu cầu xác minh account (VALIDATION_REQUIRED) — mở Antigravity đăng nhập account này để verify, rồi bấm "Xoá cooldown"'
      )
      recordCall(state, account, model, 403, 'VALIDATION_REQUIRED', true)
      lastFail = { ok: false, status: 403, message: account.lastError! }
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
    const soonest = soonestCooldown(pool, 'antigravity')
    if (soonest) {
      return { ...lastFail, retryAfterSeconds: Math.max(1, Math.ceil((soonest - Date.now()) / 1000)) }
    }
  }
  return lastFail
}

// ── Gemini SSE → chat.completions ────────────────────────────────

interface GeminiPart {
  text?: string
  functionCall?: { name?: string; args?: unknown }
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/** Upstream wraps every chunk: {"response": {<chunk>}, "traceId": ...}. */
function unwrapGemini(json: unknown): GeminiChunk | null {
  const wrapped = json as { response?: GeminiChunk } | null
  return wrapped?.response ?? null
}

/** Buffer a Gemini SSE stream into one chat.completion JSON. */
export async function collectGeminiChat(
  stream: ReadableStream<Uint8Array>,
  model: string
): Promise<{ chat: Record<string, unknown> | null; usage: { input: number; output: number } | null; error: string | null }> {
  let text = ''
  const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
  let finishReason: string | null = null
  // Holder object: TS would narrow a plain `let` to null across the await,
  // since the callback's assignments are invisible to control-flow analysis.
  const acc: { usage: { input: number; output: number } | null; error: string | null } = {
    usage: null,
    error: null
  }

  await consumeSse(stream, (event, json) => {
    const chunk = unwrapGemini(json)
    if (!chunk) {
      const errBody = json as GoogleErrorBody | null
      if (errBody?.error) acc.error = errBody.error.message ?? 'Upstream stream lỗi'
      return
    }
    for (const candidate of chunk.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) text += part.text
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${toolCalls.length}`,
            type: 'function',
            function: {
              name: part.functionCall.name ?? '',
              arguments: JSON.stringify(part.functionCall.args ?? {})
            }
          })
        }
      }
      if (candidate.finishReason) finishReason = candidate.finishReason
    }
    const u = chunk.usageMetadata
    if (u) acc.usage = { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 }
  })

  const { usage, error } = acc
  if (error) return { chat: null, usage, error }
  return {
    chat: {
      id: `chatcmpl-${randomUUID().slice(0, 8)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: text || null,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : finishReason === 'MAX_TOKENS' ? 'length' : 'stop'
        }
      ],
      usage: usage
        ? {
            prompt_tokens: usage.input,
            completion_tokens: usage.output,
            total_tokens: usage.input + usage.output
          }
        : undefined
    },
    usage,
    error: null
  }
}

const encoder = new TextEncoder()

/** Re-emit a Gemini SSE stream as OpenAI chat.completion.chunk SSE. */
export function chatStreamFromGemini(
  stream: ReadableStream<Uint8Array>,
  model: string
): ReadableStream<Uint8Array> {
  const id = `chatcmpl-${randomUUID().slice(0, 8)}`
  const created = Math.floor(Date.now() / 1000)
  let toolIndex = 0

  const chunk = (delta: Record<string, unknown>, finish: string | null, usage?: unknown) =>
    encoder.encode(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
        ...(usage ? { usage } : {})
      })}\n\n`
    )

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(chunk({ role: 'assistant' }, null))
        await consumeSse(stream, (_event, json) => {
          const data = unwrapGemini(json)
          if (!data) return
          for (const candidate of data.candidates ?? []) {
            for (const part of candidate.content?.parts ?? []) {
              if (part.text) controller.enqueue(chunk({ content: part.text }, null))
              if (part.functionCall) {
                controller.enqueue(
                  chunk(
                    {
                      tool_calls: [
                        {
                          index: toolIndex,
                          id: `call_${toolIndex}`,
                          type: 'function',
                          function: {
                            name: part.functionCall.name ?? '',
                            arguments: JSON.stringify(part.functionCall.args ?? {})
                          }
                        }
                      ]
                    },
                    null
                  )
                )
                toolIndex += 1
              }
            }
            if (candidate.finishReason) {
              const u = data.usageMetadata
              controller.enqueue(
                chunk(
                  {},
                  candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
                  u
                    ? {
                        prompt_tokens: u.promptTokenCount ?? 0,
                        completion_tokens: u.candidatesTokenCount ?? 0,
                        total_tokens:
                          u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0)
                      }
                    : undefined
                )
              )
            }
          }
        })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    }
  })
}

/** Token usage from one Gemini SSE stream, for the tee'd counting copy. */
export async function collectGeminiUsage(
  stream: ReadableStream<Uint8Array>
): Promise<{ input: number; output: number } | null> {
  const acc: { usage: { input: number; output: number } | null } = { usage: null }
  await consumeSse(stream, (_event, json) => {
    const u = unwrapGemini(json)?.usageMetadata
    if (u) acc.usage = { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0 }
  })
  return acc.usage
}
