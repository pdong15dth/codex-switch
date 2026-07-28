import { randomUUID } from 'node:crypto'
import { handle } from '@/lib/api'
import { buildStateView, importCurrent } from '@/lib/inspect'
import { defaultShellFile } from '@/lib/paths'
import { getPreset } from '@/lib/presets'
import { createProfile, loadState, updateProfile } from '@/lib/storage'
import type { ConfigItem, PresetDefaultItem } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Expand a preset template row into a real config item with an id. */
function toConfigItem(row: PresetDefaultItem): ConfigItem {
  const base = { id: randomUUID(), label: row.label, enabled: row.enabled }
  if (row.type === 'file-replace') {
    return { ...base, type: 'file-replace', targetPath: row.targetPath ?? '', content: '' }
  }
  if (row.type === 'env-var') {
    return {
      ...base,
      type: 'env-var',
      name: row.name ?? '',
      value: row.value ?? '',
      shellFile: row.shellFile ?? defaultShellFile()
    }
  }
  return {
    ...base,
    type: 'run-command',
    command: row.command ?? '',
    workingDir: row.workingDir,
    timeout: row.timeout
  }
}

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
