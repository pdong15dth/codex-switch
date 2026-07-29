import { handle } from '@/lib/api'
import { resetAccountCooldown } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (req: Request) =>
  handle(async () => {
    const { id } = (await req.json()) as { id?: string }
    await resetAccountCooldown(id ?? '')
    return { ok: true }
  })
