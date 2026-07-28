import type { Profile } from '@/types'

const TOKEN_URL = 'https://auth.openai.com/oauth/token'
/** The Codex CLI's public OAuth client id, taken from its own authorize URL. */
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

interface CodexAuthFile {
  auth_mode?: string
  OPENAI_API_KEY?: string | null
  tokens?: {
    access_token?: string
    refresh_token?: string
    id_token?: string
    account_id?: string
  }
  last_refresh?: string
}

export type RefreshOutcome =
  | { ok: true; content: string }
  | { ok: false; code: string; message: string }
  /** Nothing to do — not a rotating OAuth credential. */
  | { ok: true; content: string; skipped: true }

/**
 * Exchange a stored refresh token for a fresh pair.
 *
 * This exists because OpenAI rotates the refresh token on every refresh and
 * revokes the previous one. Writing a snapshot back to disk therefore restores a
 * credential that may already be dead — the failure mode is codex reporting
 * "your refresh token was revoked". Minting a new pair at switch time, and
 * storing it immediately, keeps rotation under this app's control instead of
 * hoping no refresh happened while it was not watching.
 */
export async function refreshCodexCredential(content: string): Promise<RefreshOutcome> {
  let data: CodexAuthFile
  try {
    data = JSON.parse(content) as CodexAuthFile
  } catch {
    return { ok: true, content, skipped: true }
  }

  const refreshToken = data.tokens?.refresh_token
  // API-key credentials never rotate, so leave them exactly as they are.
  if (!refreshToken) return { ok: true, content, skipped: true }

  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      signal: AbortSignal.timeout(15_000)
    })
  } catch (err) {
    return {
      ok: false,
      code: 'network',
      message: `Không gọi được máy chủ token: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (!res.ok) {
    let code = `http_${res.status}`
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string | { code?: string }; error_description?: string }
      if (typeof body.error === 'string') code = body.error
      else if (body.error?.code) code = body.error.code
      detail = body.error_description ?? ''
    } catch {
      // Non-JSON error body; the status carries the meaning.
    }

    const revoked = /revoked|invalid_grant|invalidated/i.test(`${code} ${detail}`)
    return {
      ok: false,
      code,
      message: revoked
        ? 'Refresh token đã bị thu hồi — account này phải đăng nhập lại.'
        : `Refresh thất bại (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`
    }
  }

  const body = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
  }
  if (!body.access_token) {
    return { ok: false, code: 'no_access_token', message: 'Máy chủ không trả access token.' }
  }

  const next: CodexAuthFile = {
    ...data,
    tokens: {
      ...data.tokens,
      access_token: body.access_token,
      // A rotated refresh token replaces the old one; if none came back, keep it.
      refresh_token: body.refresh_token ?? refreshToken,
      id_token: body.id_token ?? data.tokens?.id_token
    },
    last_refresh: new Date().toISOString()
  }

  return { ok: true, content: `${JSON.stringify(next, null, 2)}\n` }
}

export interface ProfileRefreshReport {
  refreshed: number
  skipped: number
  failures: { label: string; message: string }[]
}

/**
 * Refresh every rotating credential in a profile, updating `items` in place.
 * The caller must persist the profile before writing anything to disk, or a
 * newly minted refresh token would be lost.
 */
export async function refreshProfileCredentials(profile: Profile): Promise<ProfileRefreshReport> {
  const report: ProfileRefreshReport = { refreshed: 0, skipped: 0, failures: [] }

  for (const item of profile.items) {
    if (item.type !== 'file-replace' || !item.enabled || !item.content) continue

    const outcome = await refreshCodexCredential(item.content)
    if (!outcome.ok) {
      report.failures.push({ label: item.label, message: outcome.message })
      continue
    }
    if ('skipped' in outcome) {
      report.skipped += 1
      continue
    }

    item.content = outcome.content
    report.refreshed += 1
  }

  return report
}
