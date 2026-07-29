import { readFile } from 'node:fs/promises'
import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView } from '@/lib/inspect'
import { resolvePath } from '@/lib/paths'
import { refreshCodexCredential } from '@/lib/refresh'
import { loadState, saveState, writeAtomic } from '@/lib/storage'
import { fetchUsage } from '@/lib/usage'
import type { UsageError, UsagePoint, UsageSnapshot } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Only one usage sweep at a time (the 5-minute interval and a manual refresh
 * can overlap). Kept on globalThis so the lock survives Next's dev reloads.
 */
const lock = globalThis as typeof globalThis & { __codexSwitchUsageBusy?: boolean }

/** Refresh codes that a fresh token can fix — worth one retry after rotating. */
const AUTH_FAIL = new Set(['http_401', 'token_revoked', 'token_invalidated'])

interface Holder {
  profileId: string
  itemId: string
  targetPath: string
}

interface Target {
  key: string
  /** The newest stored credential bytes for this account. */
  content: string
  /** Every profile item holding this account, so a rotation writes back everywhere. */
  holders: Holder[]
}

type Outcome = { key: string; newContent: string | null } & (
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; code: string; message: string }
)

/**
 * Read quota for one account, rotating its credential first when needed.
 *
 * A stored access token lives about an hour, so for any account not currently
 * active the direct read almost always fails 401. Refreshing first — the same
 * rotation the switch flow performs — is what makes quota readable for every
 * account instead of only the live one.
 */
async function readOne(t: Target): Promise<Outcome> {
  let content = t.content
  let newContent: string | null = null

  const rotate = async (): Promise<{ rotated: boolean; message?: string }> => {
    const outcome = await refreshCodexCredential(content)
    if (!outcome.ok) return { rotated: false, message: outcome.message }
    if ('skipped' in outcome) return { rotated: false } // API-key credential: nothing to rotate
    content = outcome.content
    newContent = outcome.content
    return { rotated: true }
  }

  // Proactive: the id_token carries the account's real expiry, so a dead token
  // never gets sent to the backend at all.
  const exp = describeAuth(content)?.expiresAt
  const expired = exp ? new Date(exp).getTime() < Date.now() + 60_000 : false
  if (expired) {
    const r = await rotate()
    // A broken rotation chain is more informative than the 401 it would cause.
    if (!r.rotated && r.message) {
      return { key: t.key, newContent, ok: false, code: 'refresh_failed', message: r.message }
    }
  }

  let result = await fetchUsage(content, t.key)

  // Reactive: the token looked fine but the backend rejected it — rotate once
  // and retry. Covers a token revoked server-side before its expiry.
  if (!result.ok && AUTH_FAIL.has(result.code) && !newContent) {
    const r = await rotate()
    if (r.rotated) {
      result = await fetchUsage(content, t.key)
    } else if (r.message) {
      return { key: t.key, newContent, ok: false, code: 'refresh_failed', message: r.message }
    }
  }

  return result.ok
    ? { key: t.key, newContent, ok: true, snapshot: result.snapshot }
    : { key: t.key, newContent, ok: false, code: result.code, message: result.message }
}

/**
 * Read quota for every saved account and cache what comes back.
 *
 * When an account's credential rotated during the sweep, the new pair is
 * written back to every profile holding it — and to the live file on disk if
 * that account is the active one, so the CLI never picks up a revoked refresh
 * token.
 */
export const POST = () =>
  handle(async () => {
    if (lock.__codexSwitchUsageBusy) {
      return { fresh: 0, total: 0, running: true, errors: [], state: await buildStateView() }
    }
    lock.__codexSwitchUsageBusy = true

    try {
      const state = await loadState()
      const usage: Record<string, UsageSnapshot> = { ...(state.usage ?? {}) }

      // Group credential items by account, keeping a handle on where each lives
      // so a rotation can be written back to every copy.
      const byKey = new Map<string, Target>()
      for (const profile of state.profiles) {
        for (const item of profile.items) {
          if (item.type !== 'file-replace' || !item.enabled || !item.content) continue
          const key = describeAuth(item.content)?.accountKey
          if (!key) continue
          const holder: Holder = { profileId: profile.id, itemId: item.id, targetPath: item.targetPath }
          const target = byKey.get(key)
          if (target) target.holders.push(holder)
          else byKey.set(key, { key, content: item.content, holders: [holder] })
        }
      }

      // Which account sits on disk at each target path? Read each path once.
      const liveKeyByPath = new Map<string, string | null>()
      const paths = new Set<string>()
      for (const t of byKey.values()) for (const h of t.holders) paths.add(h.targetPath)
      await Promise.all(
        [...paths].map(async (p) => {
          let key: string | null = null
          try {
            key = describeAuth(await readFile(resolvePath(p), 'utf8'))?.accountKey ?? null
          } catch {
            key = null // missing or unreadable file — nothing live at this path
          }
          liveKeyByPath.set(p, key)
        })
      )

      // One read per distinct account, run together.
      const targets = [...byKey.values()]
      const results = await Promise.all(targets.map(readOne))

      // Persist rotated credentials: every stored copy, plus the live file
      // when the active account was the one that rotated.
      const diskWrites = new Map<string, string>()
      for (const res of results) {
        if (!res.newContent) continue
        const target = byKey.get(res.key)
        if (!target) continue
        for (const holder of target.holders) {
          const profile = state.profiles.find((p) => p.id === holder.profileId)
          const item = profile?.items.find((i) => i.id === holder.itemId)
          if (item && item.type === 'file-replace' && item.content !== res.newContent) {
            item.content = res.newContent
          }
          if (liveKeyByPath.get(holder.targetPath) === res.key) {
            diskWrites.set(holder.targetPath, res.newContent)
          }
        }
      }
      await Promise.all(
        [...diskWrites].map(([path, content]) => writeAtomic(resolvePath(path), content))
      )

      const history: Record<string, UsagePoint[]> = { ...(state.usageHistory ?? {}) }
      const errors: Record<string, UsageError> = { ...(state.usageErrors ?? {}) }
      const stamp = Date.now()

      let fresh = 0
      results.forEach((result) => {
        const key = result.key
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
        total: targets.length,
        errors: Object.entries(errors).map(([key, e]) => ({ key, ...e })),
        state: await buildStateView()
      }
    } finally {
      lock.__codexSwitchUsageBusy = false
    }
  })
