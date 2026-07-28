import { handle } from '@/lib/api'
import { buildStateView, importCurrent } from '@/lib/inspect'
import { getProfile, updateProfile } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Capture the live on-disk config into this profile's items. */
export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    const profile = await getProfile(id)
    await updateProfile(id, { items: await importCurrent(profile) })
    return { state: await buildStateView() }
  })
