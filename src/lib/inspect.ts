import { readFile } from 'node:fs/promises'
import { platform } from 'node:os'
import { DATA_DIR, HOME, resolvePath } from './paths'
import { describeAuth } from './identity'
import { listBackups } from './backups'
import { loadState, saveState } from './storage'
import type { AppState, ConfigItemView, Profile, ProfileView, StateView } from '@/types'

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Read the current value of an env var out of a shell file, so `env-var` items
 * can report drift the same way file items do.
 */
function readEnvFromShell(content: string, name: string, isWindows: boolean): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = isWindows
    ? new RegExp(`^\\$env:${escaped}\\s*=\\s*"?(.*?)"?\\s*$`, 'm')
    : new RegExp(`^export\\s+${escaped}="?(.*?)"?\\s*$`, 'm')
  const m = content.match(re)
  return m ? m[1] : null
}

async function buildItemViews(profile: Profile): Promise<ConfigItemView[]> {
  const isWindows = platform() === 'win32'
  const views: ConfigItemView[] = []

  for (const item of profile.items) {
    if (item.type === 'file-replace') {
      const onDisk = await readIfPresent(resolvePath(item.targetPath))
      views.push({
        ...item,
        hasContent: Boolean(item.content),
        targetExists: onDisk !== null,
        matchesDisk: Boolean(item.content) && onDisk === item.content
      })
    } else if (item.type === 'env-var') {
      const shell = await readIfPresent(resolvePath(item.shellFile))
      const current = shell ? readEnvFromShell(shell, item.name, isWindows) : null
      views.push({
        ...item,
        targetExists: shell !== null,
        hasContent: Boolean(item.value),
        matchesDisk: current !== null && current === item.value
      })
    } else {
      views.push({ ...item })
    }
  }

  return views
}

/**
 * A profile is active when the credential on disk belongs to its account.
 *
 * Identity first, bytes second: a token that refreshed a second ago is still the
 * same account, and `syncLiveCredentials` will have adopted it anyway.
 */
async function isActive(items: ConfigItemView[]): Promise<boolean> {
  const relevant = items.filter((i) => i.enabled && i.type === 'file-replace')
  if (!relevant.length) return false

  for (const item of relevant) {
    if (item.type !== 'file-replace' || !item.content) return false

    const live = await readIfPresent(resolvePath(item.targetPath))
    if (live === null) return false
    if (live === item.content) continue

    const liveKey = describeAuth(live)?.accountKey
    const storedKey = describeAuth(item.content)?.accountKey
    if (!liveKey || liveKey !== storedKey) return false
  }

  return true
}

/** Identity comes from the first enabled file item that parses as a credential. */
function deriveIdentity(items: ConfigItemView[]) {
  for (const item of items) {
    if (item.type !== 'file-replace' || !item.enabled || !item.content) continue
    const identity = describeAuth(item.content)
    if (identity && identity.label !== '—') return identity
  }
  return null
}

/**
 * Keep each profile's snapshot current for the account it belongs to.
 *
 * OpenAI rotates the refresh token on every refresh: once the CLI refreshes, the
 * previous pair is revoked. A frozen snapshot therefore rots, and switching back
 * to it later restores a revoked credential — the account then has to be logged
 * in again. So whenever the live file holds the *same account* as a stored
 * snapshot but different bytes, adopt the live bytes.
 *
 * Matching is by account identity (`sub` / email), never by content, precisely
 * because the content is what changes.
 */
async function syncLiveCredentials(state: AppState): Promise<boolean> {
  let changed = false

  for (const profile of state.profiles) {
    for (const item of profile.items) {
      if (item.type !== 'file-replace' || !item.enabled || !item.content) continue

      const live = await readIfPresent(resolvePath(item.targetPath))
      if (live === null || live === item.content) continue

      const liveKey = describeAuth(live)?.accountKey
      const storedKey = describeAuth(item.content)?.accountKey
      if (!liveKey || liveKey !== storedKey) continue

      item.content = live
      profile.updatedAt = new Date().toISOString()
      changed = true
    }
  }

  return changed
}

export async function buildStateView(): Promise<StateView> {
  const state = await loadState()
  // Runs on every read so a refresh is picked up within one poll interval.
  if (await syncLiveCredentials(state)) await saveState(state)

  const profiles: ProfileView[] = []

  for (const profile of state.profiles) {
    const items = await buildItemViews(profile)
    profiles.push({
      ...profile,
      items,
      active: await isActive(items),
      identity: deriveIdentity(items)
    })
  }

  return {
    platform: platform(),
    home: HOME,
    dataDir: DATA_DIR,
    now: Date.now(),
    categories: state.categories,
    profiles,
    activeProfileIds: state.activeProfileIds,
    backups: await listBackups()
  }
}

/**
 * Capture the live on-disk values into a profile's items — xoay-config's
 * "Import Current". This is how an account gets snapshotted after logging in.
 */
export async function importCurrent(profile: Profile): Promise<Profile['items']> {
  const isWindows = platform() === 'win32'

  return Promise.all(
    profile.items.map(async (item) => {
      if (item.type === 'file-replace') {
        const content = await readIfPresent(resolvePath(item.targetPath))
        return content === null ? item : { ...item, content }
      }
      if (item.type === 'env-var') {
        const shell = await readIfPresent(resolvePath(item.shellFile))
        const value = shell ? readEnvFromShell(shell, item.name, isWindows) : null
        return value === null ? item : { ...item, value }
      }
      return item
    })
  )
}
