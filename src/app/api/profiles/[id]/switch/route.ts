import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { refreshProfileCredentials } from '@/lib/refresh'
import { getProfile, setActiveProfile, updateProfile } from '@/lib/storage'
import { switchProfile } from '@/lib/switch-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    const profile = await getProfile(id)

    /*
     * Mint a fresh token pair before writing anything.
     *
     * Restoring a stored snapshot is not safe on its own: OpenAI rotates the
     * refresh token on every refresh and revokes the previous one, so a snapshot
     * taken before a refresh restores a dead credential — codex then reports
     * "your refresh token was revoked". Refreshing here puts rotation under this
     * app's control, and the result is persisted *before* it reaches disk so a
     * newly minted refresh token can never be lost.
     */
    const refresh = await refreshProfileCredentials(profile)
    if (refresh.refreshed > 0) await updateProfile(id, { items: profile.items })

    // A revoked credential must not be written over a working one.
    if (refresh.failures.length > 0 && refresh.refreshed === 0) {
      throw new Error(
        `Không switch được sang “${profile.name}”: ${refresh.failures[0].message} ` +
          'Bấm Thêm account để đăng nhập lại account này.'
      )
    }

    const result = await switchProfile(profile)
    if (result.success) await setActiveProfile(profile.categoryId, profile.id)

    return {
      result,
      refresh: { refreshed: refresh.refreshed, failures: refresh.failures },
      state: await buildStateView()
    }
  })
