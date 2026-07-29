/**
 * Minimal OpenAI chat.completions ↔ Responses translation plus SSE helpers.
 * The ChatGPT backend only speaks Responses-over-SSE, so everything upstream
 * is stream=true; these helpers buffer or re-emit as the client asked for.
 */

export interface SseEvent {
  event: string
  data: string
}

// ── SSE parsing ───────────────────────────────────────────────────

/** Parse an SSE buffer incrementally, returning whole events + the rest. */
export function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  // Google's stream is CRLF-terminated; the Codex one is LF. Handle both.
  const parts = buffer.split(/\r?\n\r?\n/)
  const rest = parts.pop() ?? ''
  for (const part of parts) {
    let event = ''
    const dataLines: string[] = []
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') })
  }
  return { events, rest }
}

const decoder = new TextDecoder()

/** Drain an SSE stream, invoking onEvent for each parsed event. */
export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent, json: unknown | null) => void
): Promise<void> {
  const reader = stream.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseChunk(buffer)
      buffer = rest
      for (const event of events) {
        let json: unknown | null = null
        try {
          json = JSON.parse(event.data)
        } catch {
          json = null
        }
        onEvent(event, json)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Buffer an upstream SSE stream down to its terminal response payload. */
export async function collectCompletedResponse(
  stream: ReadableStream<Uint8Array>
): Promise<{ completed: Record<string, unknown> | null; error: string | null }> {
  let completed: Record<string, unknown> | null = null
  let error: string | null = null
  // This backend leaves `output` empty in response.completed; the items only
  // arrive as stream events, so collect them and patch the final payload.
  const items: unknown[] = []
  await consumeSse(stream, (event, json) => {
    const type = (json as { type?: string } | null)?.type ?? event.event
    if (type === 'response.output_item.done') {
      const item = (json as { item?: unknown } | null)?.item
      if (item) items.push(item)
      return
    }
    if (type === 'response.completed' || type === 'response.incomplete') {
      completed = ((json as { response?: Record<string, unknown> })?.response ??
        json) as Record<string, unknown>
    } else if (type === 'response.failed' || type === 'error') {
      const err = json as { response?: { error?: { message?: string } }; message?: string } | null
      error = err?.response?.error?.message ?? err?.message ?? `Upstream stream lỗi (${type})`
    }
  })
  if (completed) {
    const output = (completed as { output?: unknown[] }).output
    if ((!output || output.length === 0) && items.length > 0) {
      ;(completed as { output?: unknown[] }).output = items
    }
  }
  return { completed, error }
}

// ── chat.completions → Responses ─────────────────────────────────

interface ChatMessage {
  role: string
  content?: unknown
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : ((part as { text?: string })?.text ?? '')
      )
      .join('')
  }
  return ''
}

/** Translate a chat.completions body into a Responses payload. */
export function chatToResponses(body: Record<string, unknown>): Record<string, unknown> {
  const messages = (body.messages ?? []) as ChatMessage[]
  const instructions: string[] = []
  const input: Record<string, unknown>[] = []

  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text = messageText(msg.content)
      if (text) instructions.push(text)
      continue
    }
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: call.id,
            name: call.function?.name,
            arguments: call.function?.arguments ?? ''
          })
        }
      }
      const text = messageText(msg.content)
      if (text) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }]
        })
      }
      continue
    }
    if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: messageText(msg.content)
      })
      continue
    }
    input.push({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: messageText(msg.content) }]
    })
  }

  const payload: Record<string, unknown> = {
    model: body.model,
    instructions: instructions.join('\n\n'),
    input
  }
  // The Codex backend rejects temperature/top_p/max_output_tokens — they are
  // deliberately NOT forwarded (same as CLIProxyAPI's own translator).

  if (Array.isArray(body.tools)) {
    payload.tools = (body.tools as Record<string, unknown>[]).map((tool) => {
      if (tool.type === 'function' && typeof tool.function === 'object' && tool.function) {
        const fn = tool.function as Record<string, unknown>
        return { type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters }
      }
      return tool
    })
    if (typeof body.tool_choice === 'string') payload.tool_choice = body.tool_choice
  }
  return payload
}

// ── Responses → chat.completions ─────────────────────────────────

interface ResponsesOutputItem {
  type?: string
  content?: { type?: string; text?: string }[]
  call_id?: string
  name?: string
  arguments?: string
}

interface ResponsesObject {
  id?: string
  created_at?: number
  model?: string
  output?: ResponsesOutputItem[]
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

function chatParts(response: ResponsesObject): {
  text: string
  toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
} {
  let text = ''
  const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = []
  for (const item of response.output ?? []) {
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && part.text) text += part.text
      }
    } else if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id ?? `call_${toolCalls.length}`,
        type: 'function',
        function: { name: item.name ?? '', arguments: item.arguments ?? '' }
      })
    }
  }
  return { text, toolCalls }
}

/** Build a chat.completion JSON from a buffered Responses object. */
export function responsesToChat(
  response: ResponsesObject,
  model: string
): Record<string, unknown> {
  const { text, toolCalls } = chatParts(response)
  return {
    id: (response.id ?? 'chatcmpl-pool').replace(/^resp_/, 'chatcmpl-'),
    object: 'chat.completion',
    created: response.created_at ?? Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        },
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
      }
    ],
    usage: response.usage
      ? {
          prompt_tokens: response.usage.input_tokens ?? 0,
          completion_tokens: response.usage.output_tokens ?? 0,
          total_tokens:
            response.usage.total_tokens ??
            (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0)
        }
      : undefined
  }
}

// ── Streaming: Responses SSE → chat.completions chunks ───────────

const encoder = new TextEncoder()

/**
 * Re-emit an upstream Responses SSE stream as OpenAI chat.completion.chunk
 * SSE: text deltas, tool-call items on completion, a final finish chunk with
 * usage, then [DONE].
 */
export function chatStreamFromResponses(
  stream: ReadableStream<Uint8Array>,
  model: string
): ReadableStream<Uint8Array> {
  const id = `chatcmpl-${randomSuffix()}`
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
        await consumeSse(stream, (event, json) => {
          const type = (json as { type?: string } | null)?.type ?? event.event
          if (type === 'response.output_text.delta') {
            const delta = (json as { delta?: string } | null)?.delta
            if (delta) controller.enqueue(chunk({ content: delta }, null))
          } else if (type === 'response.output_item.done') {
            const item = (json as { item?: ResponsesOutputItem } | null)?.item
            if (item?.type === 'function_call') {
              controller.enqueue(
                chunk(
                  {
                    tool_calls: [
                      {
                        index: toolIndex++,
                        id: item.call_id ?? `call_${toolIndex}`,
                        type: 'function',
                        function: { name: item.name ?? '', arguments: item.arguments ?? '' }
                      }
                    ]
                  },
                  null
                )
              )
            }
          } else if (type === 'response.completed') {
            const response = (json as { response?: ResponsesObject } | null)?.response
            const u = response?.usage
            controller.enqueue(
              chunk(
                {},
                'stop',
                u
                  ? {
                                      prompt_tokens: u.input_tokens ?? 0,
                                      completion_tokens: u.output_tokens ?? 0,
                                      total_tokens: u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
                                    }
                  : undefined
              )
            )
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

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}
