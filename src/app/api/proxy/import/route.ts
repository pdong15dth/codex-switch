import { handle } from '@/lib/api'
import { importSession } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Import one session (Codex/Antigravity token storage JSON) into the pool. */
export const POST = (req: Request) =>
  handle(async () => importSession(await req.json()))
