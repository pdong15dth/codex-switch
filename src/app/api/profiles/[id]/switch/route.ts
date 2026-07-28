import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView } from '@/lib/inspect'
import { refreshProfileCredentials } from '@/lib/refresh'
import { getProfile, setActiveProfile, updateProfile } from '@/lib/storage'
import { switchProfile } from '@/lib/switch-engine'
import type { Profile } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Don't rely on a token that is about to lapse mid-request. */
const SAFETY_MARGIN_MS = 60_000

/**
 * Soonest access-token expiry across a profile's enabled credentials, or null
 * when none of them carry an expiry (an API key, say).
 */
function earliestExpiry(profile: Profile): number | null {
  let soonest: number | null = null

  for (const item of profile.items) {
    if (item.type !== 'file-replace' || !item.enabled || !item.content) continue
    const iso = describeAuth(item.content)?.expiresAt
    if (!iso) continue
    const t = new Date(iso).getTime()
    if (soonest === null || t < soonest) soonest = t
  }

  return soonest
}

export const POST = (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params
    const profile = await getProfile(id)

    /*
     * Try to mint a fresh pair first. OpenAI rotates the refresh token on every
     * refresh and revokes the previous one, so writing a stored snapshot back can
     * restore a credential that is already dead.
     *
     * But a failed refresh does not mean the credential is useless: OpenAI also
     * revokes an account's refresh token as soon as `codex login` runs for a
     * different account, while that account's *access* token keeps working until
     * it lapses (about an hour). Blocking the switch in that window would refuse
     * a perfectly good credential, so fall through and warn instead.
     */
    const refresh = await refreshProfileCredentials(profile)
    if (refresh.refreshed > 0) await updateProfile(id, { items: profile.items })

    let warning: string | null = null

    if (refresh.failures.length > 0 && refresh.refreshed === 0) {
      const expiry = earliestExpiry(profile)
      const usable = expiry === null || expiry > Date.now() + SAFETY_MARGIN_MS

      if (!usable) {
        throw new Error(
          `Không switch được sang “${profile.name}”: ${refresh.failures[0].message} ` +
            'Access token cũng đã hết hạn nên không còn dùng được. Bấm Thêm account để đăng nhập lại.'
        )
      }

      const until = expiry
        ? new Date(expiry).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : null
      warning =
        `Không làm mới được token của “${profile.name}” (${refresh.failures[0].message}) ` +
        (until
          ? `Access token hiện tại vẫn dùng được tới khoảng ${until}, sau đó phải đăng nhập lại account này.`
          : 'Vẫn switch bằng credential đã lưu.')
    }

    const result = await switchProfile(profile)
    if (result.success) await setActiveProfile(profile.categoryId, profile.id)

    return {
      result,
      refresh: { refreshed: refresh.refreshed, failures: refresh.failures, warning },
      state: await buildStateView()
    }
  })
