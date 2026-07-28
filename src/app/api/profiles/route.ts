import { handle } from '@/lib/api'
import { buildStateView, importCurrent } from '@/lib/inspect'
import { toConfigItem } from '@/lib/preset-items'
import { getPreset } from '@/lib/presets'
import { createProfile, loadState, updateProfile } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as {
      name?: string
      categoryId?: string
      presetId?: string
      importCurrent?: boolean
    }

    const state = await loadState()

    // Resolve the category: explicit id wins, otherwise match the preset's
    // category by name so a fresh install works without extra clicks.
    let categoryId = body.categoryId
    const preset = body.presetId ? getPreset(body.presetId) : undefined
    if (!categoryId && preset) {
      categoryId = state.categories.find((c) => c.name === preset.categoryName)?.id
    }
    if (!categoryId) throw new Error('Thiếu categoryId')

    const items = (preset?.defaultItems ?? []).map(toConfigItem)

    let profile = await createProfile({
      name: body.name ?? '',
      categoryId,
      presetId: body.presetId,
      items
    })

    // Snapshot the live config straight away — that is the common case when
    // saving an account you just logged into.
    if (body.importCurrent) {
      profile = await updateProfile(profile.id, { items: await importCurrent(profile) })
    }

    return { profile, state: await buildStateView() }
  })
