import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { getProfile, setActiveProfile } from '@/lib/storage'
import { switchProfile } from '@/lib/switch-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    const profile = await getProfile(id)
    const result = await switchProfile(profile)
    if (result.success) await setActiveProfile(profile.categoryId, profile.id)
    return { result, state: await buildStateView() }
  })
