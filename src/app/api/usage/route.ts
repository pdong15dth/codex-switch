import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView } from '@/lib/inspect'
import { loadState, saveState } from '@/lib/storage'
import { fetchUsage } from '@/lib/usage'
import type { UsageError, UsagePoint, UsageSnapshot } from '@/types'

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

    const history: Record<string, UsagePoint[]> = { ...(state.usageHistory ?? {}) }
    const errors: Record<string, UsageError> = { ...(state.usageErrors ?? {}) }
    const stamp = Date.now()
    const keys = [...seen]

    let fresh = 0
    results.forEach((result, i) => {
      const key = keys[i]
      if (!result.ok) {
        errors[key] = { code: result.code, message: result.message, at: new Date().toISOString() }
        return
      }
      delete errors[key]

      const snapshot = result.snapshot
      usage[snapshot.accountKey] = snapshot
      fresh += 1

      // The backend only reports "used right now", so build the series here.
      const used = snapshot.primary?.usedPercent ?? snapshot.secondary?.usedPercent
      if (typeof used !== 'number') return

      const series = history[snapshot.accountKey] ?? []
      const last = series[series.length - 1]
      // Keep one point a minute unless the figure moved, so the file stays small.
      if (!last || last.used !== used || stamp - last.t >= 60_000) {
        series.push({ t: stamp, used })
      }
      // Roughly a fortnight at one point a minute.
      history[snapshot.accountKey] = series.slice(-20_000)
    })

    state.usage = usage
    state.usageHistory = history
    state.usageErrors = errors
    await saveState(state)

    return {
      fresh,
      total: keys.length,
      errors: Object.entries(errors).map(([key, e]) => ({ key, ...e })),
      state: await buildStateView()
    }
  })
