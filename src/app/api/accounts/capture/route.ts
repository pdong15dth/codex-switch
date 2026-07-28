import { handle } from '@/lib/api'
import { describeAuth } from '@/lib/identity'
import { buildStateView, importCurrent } from '@/lib/inspect'
import { deriveProfileName, toConfigItem } from '@/lib/preset-items'
import { getPreset } from '@/lib/presets'
import { createProfile, loadState } from '@/lib/storage'
import type { Profile } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-shot "save whoever is logged in right now": read the live credential
 * files, name the profile from the identity inside them, and store it.
 *
 * Returns `{ duplicate }` instead of creating anything when the live config
 * already matches a saved profile — logging in and capturing twice should not
 * quietly produce two identical profiles.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as { categoryId?: string; presetId?: string }
    const presetId = body.presetId ?? 'codex-cli'
    const preset = getPreset(presetId)
    if (!preset) throw new Error(`Preset không tồn tại: ${presetId}`)

    const state = await loadState()
    const categoryId =
      body.categoryId ?? state.categories.find((c) => c.name === preset.categoryName)?.id
    if (!categoryId) throw new Error('Thiếu categoryId')

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
      if (same) return { duplicate: profile.name, state: await buildStateView() }
    }

    const first = captured[0]
    const identity = first.type === 'file-replace' ? describeAuth(first.content) : null
    const name = deriveProfileName(
      identity?.label,
      existing.map((p) => p.name)
    )

    const profile = await createProfile({ name, categoryId, presetId, items })
    return { profile, identity, state: await buildStateView() }
  })
