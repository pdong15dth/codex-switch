import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { captureLiveAsProfile } from './capture'
import { describeAuth } from './identity'
import { DATA_DIR, resolvePath } from './paths'
import { getPreset } from './presets'
import { loadState } from './storage'

const AUTH_FILE = resolvePath('~/.codex/auth.json')
const SLOT_DIR = join(DATA_DIR, 'pre-login')
const SLOT_FILE = join(SLOT_DIR, 'auth.json')

/**
 * A logout-free way to add an account.
 *
 * `codex logout` revokes the credential server-side — killing the same token
 * pair already stored in a profile. So the login flow must never log out.
 * Instead the live auth.json is moved aside: codex then sees a clean slate
 * (no "already logged in" prompt), and the previous account's refresh token
 * stays valid because nothing ever tells the server to revoke it.
 */
export async function prepareLoginSlot(): Promise<void> {
  // Heal whatever a previous attempt left behind: both files means the login
  // landed but the server died before cleanup (the aside credential was
  // already profiled by that attempt); slot-only means it died mid-login.
  if (existsSync(SLOT_FILE)) {
    if (existsSync(AUTH_FILE)) await rm(SLOT_FILE)
    else await rename(SLOT_FILE, AUTH_FILE)
  }
  if (!existsSync(AUTH_FILE)) return

  // The credential about to leave disk must exist in a profile first —
  // otherwise a successful new login would strand it inside the slot file.
  const content = await readFile(AUTH_FILE, 'utf8')
  const key = describeAuth(content)?.accountKey
  if (key) {
    const state = await loadState()
    const saved = state.profiles.some((p) =>
      p.items.some(
        (i) =>
          i.type === 'file-replace' &&
          i.content &&
          describeAuth(i.content)?.accountKey === key
      )
    )
    if (!saved) {
      const preset = getPreset('codex-cli')
      const category = state.categories.find((c) => c.name === preset?.categoryName)
      if (preset && category) await captureLiveAsProfile(category.id, preset.id)
    }
  }

  await mkdir(SLOT_DIR, { recursive: true })
  await rename(AUTH_FILE, SLOT_FILE)
}

/**
 * Run when the login job exits. A fresh auth.json means the login landed and
 * the aside credential (already in a profile) can be dropped; otherwise the
 * login was cancelled or failed, so put the previous credential back exactly
 * where it was.
 */
export async function settleLoginSlot(): Promise<void> {
  if (!existsSync(SLOT_FILE)) return
  if (existsSync(AUTH_FILE)) {
    await rm(SLOT_FILE)
  } else {
    await rename(SLOT_FILE, AUTH_FILE)
  }
}
