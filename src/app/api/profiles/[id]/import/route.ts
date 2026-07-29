import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView, importCurrent } from '@/lib/inspect'
import { getProfile, loadState, saveState, updateProfile } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Capture the live on-disk config into this profile's items. */
export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    const profile = await getProfile(id)
    const items = await importCurrent(profile)
    await updateProfile(id, { items })

    // A freshly captured credential makes any stored read error for this
    // account obsolete — clear it, or the UI keeps saying "đăng nhập lại"
    // until the next quota sweep.
    const key = items.find((i) => i.enabled && i.type === 'file-replace' && i.content)
    const accountKey =
      key?.type === 'file-replace' && key.content
        ? describeAuth(key.content)?.accountKey
        : undefined
    if (accountKey) {
      const state = await loadState()
      if (state.usageErrors?.[accountKey]) {
        delete state.usageErrors[accountKey]
        await saveState(state)
      }
    }

    return { state: await buildStateView() }
  })
