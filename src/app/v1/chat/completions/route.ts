import {
  chatStreamFromGemini,
  collectGeminiChat,
  collectGeminiUsage,
  executeAntigravity
} from '@/lib/proxy-antigravity'
import {
  addTokenUsage,
  executeCodex,
  extractUsage,
  isValidProxyKey,
  providerForModel
} from '@/lib/proxy-pool'
import {
  chatStreamFromResponses,
  chatToResponses,
  collectCompletedResponse,
  responsesToChat
} from '@/lib/proxy-translate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function openAiError(status: number, message: string, retryAfterSeconds?: number): Response {
  return Response.json(
    { error: { message, type: status === 429 ? 'rate_limit_error' : 'server_error' } },
    {
      status,
      headers: retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : undefined
    }
  )
}

const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }

/**
 * OpenAI chat.completions endpoint: routed by model — gpt-/codex- models to
 * the Codex pool (Responses translation), gemini-/claude- models to the
 * Antigravity pool (Gemini generateContent translation).
 */
export const POST = async (req: Request) => {
  if (!(await isValidProxyKey(req))) return openAiError(401, 'Sai hoặc thiếu API key')

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return openAiError(400, 'Body không phải JSON hợp lệ')
  }
  const model = typeof body.model === 'string' ? body.model : ''
  if (!model) return openAiError(400, 'Thiếu model')

  const provider = providerForModel(model)
  if (provider === 'antigravity') return antigravityChat(body, model)
  if (provider === 'codex') return codexChat(body, model)
  return openAiError(400, `Model không thuộc pool nào: ${model}`)
}

async function codexChat(body: Record<string, unknown>, model: string): Promise<Response> {
  const result = await executeCodex(chatToResponses(body), model)
  if (!result.ok) return openAiError(result.status, result.message, result.retryAfterSeconds)

  if (body.stream === true) {
    const [pass, count] = result.body.tee()
    void (async () => {
      const { completed } = await collectCompletedResponse(count)
      const usage = completed ? extractUsage({ response: completed }) : null
      if (usage) await addTokenUsage(result.account.id, usage)
    })()
    return new Response(chatStreamFromResponses(pass, model), { headers: SSE_HEADERS })
  }

  const { completed, error } = await collectCompletedResponse(result.body)
  if (!completed) return openAiError(502, error ?? 'Upstream không trả response.completed')
  const usage = extractUsage({ response: completed })
  if (usage) await addTokenUsage(result.account.id, usage)
  return Response.json(responsesToChat(completed as never, model))
}

async function antigravityChat(body: Record<string, unknown>, model: string): Promise<Response> {
  const result = await executeAntigravity(body, model)
  if (!result.ok) return openAiError(result.status, result.message, result.retryAfterSeconds)

  if (body.stream === true) {
    const [pass, count] = result.body.tee()
    void (async () => {
      const usage = await collectGeminiUsage(count)
      if (usage) await addTokenUsage(result.account.id, usage)
    })()
    return new Response(chatStreamFromGemini(pass, model), { headers: SSE_HEADERS })
  }

  const { chat, usage, error } = await collectGeminiChat(result.body, model)
  if (usage) await addTokenUsage(result.account.id, usage)
  if (!chat) return openAiError(502, error ?? 'Upstream không trả nội dung')
  return Response.json(chat)
}
