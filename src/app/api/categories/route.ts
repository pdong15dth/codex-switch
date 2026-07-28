import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { createCategory } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (req: Request) =>
  handle(async () => {
    const { name } = (await req.json()) as { name?: string }
    const category = await createCategory(name ?? '')
    return { category, state: await buildStateView() }
  })
