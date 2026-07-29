import { addTokenUsage, executeCodex, extractUsage, isValidProxyKey, providerForModel } from '@/lib/proxy-pool'
import { collectCompletedResponse } from '@/lib/proxy-translate'

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

/** Count token usage from a tee'd copy of the stream once it finishes. */
function trackUsage(stream: ReadableStream<Uint8Array>, accountId: string): void {
  void (async () => {
    const { completed } = await collectCompletedResponse(stream)
    const usage = completed ? extractUsage({ response: completed }) : null
    if (usage) await addTokenUsage(accountId, usage)
  })()
}

/**
 * OpenAI Responses endpoint backed by the Codex account pool. The upstream
 * ChatGPT backend only streams, so non-stream clients get the buffered
 * response.completed payload.
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
  if (providerForModel(model) !== 'codex') {
    return openAiError(400, `/v1/responses chỉ hỗ trợ model Codex (gpt-*/codex*), không phải ${model}`)
  }

  const result = await executeCodex(body, model)
  if (!result.ok) return openAiError(result.status, result.message, result.retryAfterSeconds)

  if (body.stream === true) {
    const [pass, count] = result.body.tee()
    trackUsage(count, result.account.id)
    return new Response(pass, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
    })
  }

  const { completed, error } = await collectCompletedResponse(result.body)
  if (!completed) return openAiError(502, error ?? 'Upstream không trả response.completed')
  const usage = extractUsage({ response: completed })
  if (usage) await addTokenUsage(result.account.id, usage)
  return Response.json(completed)
}
