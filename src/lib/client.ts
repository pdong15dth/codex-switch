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
    req<{
      result: SwitchResult
      refresh: {
        refreshed: number
        failures: { label: string; message: string }[]
        warning: string | null
      }
      state: StateView
    }>(`/api/profiles/${id}/switch`, { method: 'POST' }),

  importCurrent: (id: string) =>
    req<{ state: StateView }>(`/api/profiles/${id}/import`, { method: 'POST' }),

  /** Save whoever is logged in right now, auto-named from the credential. */
  captureAccount: (body: { categoryId: string; presetId: string }) =>
    req<{ profile?: { name: string }; duplicate?: string; state: StateView }>(
      '/api/accounts/capture',
      { method: 'POST', ...json(body) }
    ),

  /** One-off OTP from a pasted secret. Nothing is stored server-side. */
  otp: (secret: string) =>
    req<{ code: string; expiresAt: number; period: number }>('/api/totp', {
      method: 'POST',
      ...json({ secret })
    }),

  /** Current 2FA code for a profile. The secret stays on the server. */
  totpCode: (id: string) =>
    req<{ code: string; expiresAt: number; period: number }>(`/api/profiles/${id}/totp`),

  /** Store or clear a profile's 2FA secret. Pass null to remove it. */
  setTotp: (id: string, secret: string | null) =>
    req<{ state: StateView }>(`/api/profiles/${id}/totp`, {
      method: 'PUT',
      ...json({ secret })
    }),

  /** Read quota for every saved account and cache the results. */
  refreshUsage: () =>
    req<{ fresh: number; total: number; state: StateView }>('/api/usage', { method: 'POST' }),

  /** Open a verification URL in a private window on the host machine. */
  openPrivate: (url: string) =>
    req<{ browser: string }>('/api/browser/open', { method: 'POST', ...json({ url }) }),

  startJob: (action: string) =>
    req<{ jobId: string; command: string }>('/api/jobs', { method: 'POST', ...json({ action }) }),

  job: (id: string) =>
    req<{ lines: string[]; done: boolean; code: number | null; command: string }>(`/api/jobs/${id}`)
}
