import { handle } from '@/lib/api'
import { captureLiveAsProfile } from '@/lib/capture'
import { buildStateView } from '@/lib/inspect'
import { getPreset } from '@/lib/presets'
import { loadState } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Save whoever is logged in right now, as a profile in the given category. */
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

    const result = await captureLiveAsProfile(categoryId, presetId)
    return { ...result, state: await buildStateView() }
  })
