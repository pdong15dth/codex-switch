import { isValidProxyKey } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Codex models (ChatGPT pool) + Antigravity models (Google pool). */
const MODELS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gemini-3-flash',
  'gemini-3.1-pro-low',
  'gemini-pro-agent',
  'claude-sonnet-4-6',
  'claude-opus-4-6-thinking'
]

export const GET = async (req: Request) => {
  if (!(await isValidProxyKey(req))) {
    return Response.json({ error: { message: 'Sai hoặc thiếu API key' } }, { status: 401 })
  }
  return Response.json({
    object: 'list',
    data: MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'openai' }))
  })
}
