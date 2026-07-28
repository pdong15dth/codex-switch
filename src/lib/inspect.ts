import { readFile } from 'node:fs/promises'
import { platform } from 'node:os'
import { DATA_DIR, HOME, resolvePath } from './paths'
import { describeAuth } from './identity'
import { listBackups } from './backups'
import { loadState } from './storage'
import type { ConfigItemView, Profile, ProfileView, StateView } from '@/types'

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
 * A profile counts as active when every enabled file-replace item's captured
 * content is byte-identical to what is on disk. Derived from disk rather than
 * stored, so it stays correct even when the user logs in via the CLI directly.
 */
function isActive(items: ConfigItemView[]): boolean {
  const relevant = items.filter((i) => i.enabled && i.type === 'file-replace')
  if (!relevant.length) return false
  return relevant.every((i) => i.matchesDisk)
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

export async function buildStateView(): Promise<StateView> {
  const state = await loadState()
  const profiles: ProfileView[] = []

  for (const profile of state.profiles) {
    const items = await buildItemViews(profile)
    profiles.push({
      ...profile,
      items,
      active: isActive(items),
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
