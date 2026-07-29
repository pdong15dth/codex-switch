import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { BACKUP_DIR, DATA_DIR, STATE_FILE } from './paths'
import { BUILTIN_PRESETS } from './presets'
import type { AppState, Category, Profile } from '@/types'

const SCHEMA_VERSION = 1

/** Write via temp + rename so a crash cannot leave a truncated file. */
export async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.tmp-${process.pid}-${randomUUID().slice(0, 8)}`)
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

function nowIso(): string {
  return new Date().toISOString()
}

function seedState(): AppState {
  const ts = nowIso()
  // One built-in category per preset, so a fresh install already has somewhere
  // to put profiles.
  const names = [...new Set(BUILTIN_PRESETS.map((p) => p.categoryName))]
  return {
    schemaVersion: SCHEMA_VERSION,
    categories: names.map((name) => ({
      id: randomUUID(),
      name,
      builtIn: true,
      createdAt: ts,
      updatedAt: ts
    })),
    profiles: [],
    activeProfileIds: {},
    usage: {}
  }
}

export async function loadState(): Promise<AppState> {
  await mkdir(BACKUP_DIR, { recursive: true })
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8')) as AppState
    return {
      // Spread first so fields added by newer versions survive a downgrade.
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION,
      categories: parsed.categories ?? [],
      profiles: parsed.profiles ?? [],
      activeProfileIds: parsed.activeProfileIds ?? {},
      usage: parsed.usage ?? {},
      usageHistory: parsed.usageHistory ?? {},
      usageErrors: parsed.usageErrors ?? {},
      proxy: parsed.proxy ?? { apiKey: '', strategy: 'round-robin', accounts: [] }
    }
  } catch {
    const fresh = seedState()
    await saveState(fresh)
    return fresh
  }
}

export async function saveState(state: AppState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeAtomic(STATE_FILE, JSON.stringify(state, null, 2))
}

// ── Category CRUD ─────────────────────────────────────────────────

export async function createCategory(name: string): Promise<Category> {
  const state = await loadState()
  const clean = name.trim()
  if (!clean) throw new Error('Tên category không được để trống')
  if (state.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`Đã có category "${clean}"`)
  }
  const ts = nowIso()
  const category: Category = {
    id: randomUUID(),
    name: clean,
    builtIn: false,
    createdAt: ts,
    updatedAt: ts
  }
  state.categories.push(category)
  await saveState(state)
  return category
}

export async function deleteCategory(id: string): Promise<void> {
  const state = await loadState()
  const category = state.categories.find((c) => c.id === id)
  if (!category) throw new Error('Không tìm thấy category')
  if (state.profiles.some((p) => p.categoryId === id)) {
    throw new Error('Category còn profile bên trong — xoá profile trước')
  }
  state.categories = state.categories.filter((c) => c.id !== id)
  delete state.activeProfileIds[id]
  await saveState(state)
}

// ── Profile CRUD ──────────────────────────────────────────────────

export async function createProfile(input: {
  name: string
  categoryId: string
  presetId?: string
  items: Profile['items']
}): Promise<Profile> {
  const state = await loadState()
  const clean = input.name.trim()
  if (!clean) throw new Error('Tên profile không được để trống')
  if (!state.categories.some((c) => c.id === input.categoryId)) {
    throw new Error('Category không tồn tại')
  }
  const dupe = state.profiles.some(
    (p) => p.categoryId === input.categoryId && p.name.toLowerCase() === clean.toLowerCase()
  )
  if (dupe) throw new Error(`Category này đã có profile tên "${clean}"`)

  const ts = nowIso()
  const profile: Profile = {
    id: randomUUID(),
    name: clean,
    categoryId: input.categoryId,
    presetId: input.presetId,
    items: input.items,
    createdAt: ts,
    updatedAt: ts
  }
  state.profiles.push(profile)
  await saveState(state)
  return profile
}

export async function getProfile(id: string): Promise<Profile> {
  const state = await loadState()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Không tìm thấy profile')
  return profile
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'name' | 'items'>>
): Promise<Profile> {
  const state = await loadState()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Không tìm thấy profile')

  if (patch.name !== undefined) {
    const clean = patch.name.trim()
    if (!clean) throw new Error('Tên profile không được để trống')
    const dupe = state.profiles.some(
      (p) =>
        p.id !== id &&
        p.categoryId === profile.categoryId &&
        p.name.toLowerCase() === clean.toLowerCase()
    )
    if (dupe) throw new Error(`Category này đã có profile tên "${clean}"`)
    profile.name = clean
  }
  if (patch.items !== undefined) profile.items = patch.items

  profile.updatedAt = nowIso()
  await saveState(state)
  return profile
}

export async function deleteProfile(id: string): Promise<void> {
  const state = await loadState()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Không tìm thấy profile')
  state.profiles = state.profiles.filter((p) => p.id !== id)
  if (state.activeProfileIds[profile.categoryId] === id) {
    delete state.activeProfileIds[profile.categoryId]
  }
  await saveState(state)
}

export async function setActiveProfile(categoryId: string, profileId: string): Promise<void> {
  const state = await loadState()
  state.activeProfileIds[categoryId] = profileId
  await saveState(state)
}
