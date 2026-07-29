import { describeAuth } from './identity'
import { importCurrent } from './inspect'
import { deriveProfileName, toConfigItem } from './preset-items'
import { getPreset } from './presets'
import { createProfile, loadState } from './storage'
import type { Identity, Profile } from '@/types'

export interface CaptureOutcome {
  profile?: Profile
  identity?: Identity | null
  /** Set when the live config is already saved — capturing twice should not
   * quietly produce two identical profiles. */
  duplicate?: string
}

/**
 * One-shot "save whoever is logged in right now": read the live credential
 * files, name the profile from the identity inside them, and store it.
 *
 * Shared by the capture API and the login slot, which must guarantee the
 * account leaving disk exists in a profile before a new login replaces it.
 */
export async function captureLiveAsProfile(
  categoryId: string,
  presetId: string
): Promise<CaptureOutcome> {
  const preset = getPreset(presetId)
  if (!preset) throw new Error(`Preset không tồn tại: ${presetId}`)

  const state = await loadState()

  // Build the preset's items in memory and fill them from disk, so the name
  // can come from the captured credential before anything is persisted.
  const draft: Profile = {
    id: 'draft',
    name: 'draft',
    categoryId,
    presetId,
    items: preset.defaultItems.map(toConfigItem),
    createdAt: '',
    updatedAt: ''
  }
  const items = await importCurrent(draft)

  const files = items.filter((i) => i.enabled && i.type === 'file-replace')
  const captured = files.filter((i) => i.type === 'file-replace' && i.content)
  if (captured.length === 0) {
    throw new Error(
      'Không tìm thấy file credential nào trên đĩa. Hãy đăng nhập bằng codex trước, rồi thử lại.'
    )
  }

  // Already saved? Compare the captured content against existing profiles.
  const existing = state.profiles.filter((p) => p.categoryId === categoryId)
  for (const profile of existing) {
    const same = captured.every((c) =>
      profile.items.some(
        (i) =>
          i.type === 'file-replace' &&
          c.type === 'file-replace' &&
          i.targetPath === c.targetPath &&
          i.content === c.content
      )
    )
    if (same) return { duplicate: profile.name }
  }

  const first = captured[0]
  const identity = first.type === 'file-replace' ? describeAuth(first.content) : null
  const name = deriveProfileName(
    identity?.label,
    existing.map((p) => p.name)
  )

  const profile = await createProfile({ name, categoryId, presetId, items })
  return { profile, identity }
}
