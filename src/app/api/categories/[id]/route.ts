import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { deleteCategory } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const DELETE = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    await deleteCategory(id)
    return { state: await buildStateView() }
  })
