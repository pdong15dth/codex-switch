import type { Preset, StateView, SwitchResult } from '@/types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Lỗi ${res.status}`)
  return data as T
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const api = {
  state: () => req<StateView>('/api/state'),

  presets: () => req<{ presets: Preset[]; defaultShellFile: string }>('/api/presets'),

  createCategory: (name: string) =>
    req<{ state: StateView }>('/api/categories', { method: 'POST', ...json({ name }) }),

  deleteCategory: (id: string) =>
    req<{ state: StateView }>(`/api/categories/${id}`, { method: 'DELETE' }),

  createProfile: (body: {
    name: string
    categoryId?: string
    presetId?: string
    importCurrent?: boolean
  }) => req<{ state: StateView }>('/api/profiles', { method: 'POST', ...json(body) }),

  updateProfile: (id: string, body: { name?: string; items?: unknown[] }) =>
    req<{ state: StateView }>(`/api/profiles/${id}`, { method: 'PATCH', ...json(body) }),

  deleteProfile: (id: string) =>
    req<{ state: StateView }>(`/api/profiles/${id}`, { method: 'DELETE' }),

  switchProfile: (id: string) =>
    req<{ result: SwitchResult; state: StateView }>(`/api/profiles/${id}/switch`, {
      method: 'POST'
    }),

  importCurrent: (id: string) =>
    req<{ state: StateView }>(`/api/profiles/${id}/import`, { method: 'POST' }),

  startJob: (action: string) =>
    req<{ jobId: string; command: string }>('/api/jobs', { method: 'POST', ...json({ action }) }),

  job: (id: string) =>
    req<{ lines: string[]; done: boolean; code: number | null; command: string }>(`/api/jobs/${id}`)
}
