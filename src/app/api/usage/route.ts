import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView } from '@/lib/inspect'
import { loadState, saveState } from '@/lib/storage'
import { fetchUsage } from '@/lib/usage'
import type { UsageSnapshot } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Read quota for every saved account and cache what comes back.
 *
 * An inactive account's access token expires after an hour, so most of these
 * calls fail with 401 and that is fine: the cached figure from when the account
 * was last active is kept, and the UI labels how old it is.
 */
export const POST = () =>
  handle(async () => {
    const state = await loadState()
    const usage: Record<string, UsageSnapshot> = { ...(state.usage ?? {}) }

    const targets = state.profiles.flatMap((profile) =>
      profile.items
        .filter((i) => i.type === 'file-replace' && i.enabled && i.content)
        .flatMap((item) => {
          if (item.type !== 'file-replace') return []
          const key = describeAuth(item.content)?.accountKey
          return key ? [{ key, content: item.content }] : []
        })
    )

    // One request per distinct account, run together.
    const seen = new Set<string>()
    const results = await Promise.all(
      targets
        .filter((t) => (seen.has(t.key) ? false : (seen.add(t.key), true)))
        .map((t) => fetchUsage(t.content, t.key))
    )

    let fresh = 0
    for (const snapshot of results) {
      if (!snapshot) continue
      usage[snapshot.accountKey] = snapshot
      fresh += 1
    }

    state.usage = usage
    await saveState(state)

    return { fresh, total: seen.size, state: await buildStateView() }
  })
