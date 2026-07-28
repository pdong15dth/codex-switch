import type { UsageSnapshot, UsageWindow } from '@/types'

/** The endpoint the Codex CLI itself polls for rate-limit state. */
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

interface RawWindow {
  used_percent?: number
  limit_window_seconds?: number
  reset_at?: number
}

interface RawUsage {
  email?: string
  plan_type?: string
  rate_limit?: {
    limit_reached?: boolean
    primary_window?: RawWindow | null
    secondary_window?: RawWindow | null
  }
  credits?: { balance?: string; has_credits?: boolean; unlimited?: boolean }
}

function toWindow(raw: RawWindow | null | undefined): UsageWindow | null {
  if (!raw || typeof raw.used_percent !== 'number') return null
  return {
    usedPercent: raw.used_percent,
    windowSeconds: raw.limit_window_seconds ?? 0,
    resetAt: raw.reset_at ? new Date(raw.reset_at * 1000).toISOString() : null
  }
}

/** Pull the access token out of a stored credential file. Never leaves the server. */
export function accessTokenOf(content: string): { token: string; accountId?: string } | null {
  try {
    const data = JSON.parse(content) as {
      tokens?: { access_token?: string; account_id?: string }
    }
    const token = data.tokens?.access_token
    return token ? { token, accountId: data.tokens?.account_id } : null
  } catch {
    return null
  }
}

export type UsageResult =
  | { ok: true; snapshot: UsageSnapshot }
  | { ok: false; code: string; message: string }

/** Map the backend's error codes to something worth showing a user. */
function explain(code: string, status: number): string {
  if (code === 'token_revoked' || code === 'token_invalidated') {
    return 'Token đã bị thu hồi — cần đăng nhập lại account này.'
  }
  if (status === 401) return 'Token hết hạn hoặc không còn hiệu lực.'
  if (status === 403) return 'Bị từ chối (403). Có thể do Cloudflare hoặc account bị hạn chế.'
  if (status === 429) return 'Bị giới hạn tần suất, thử lại sau.'
  return `Đọc quota thất bại (HTTP ${status}).`
}

/**
 * Read quota for one credential. Failures are reported rather than swallowed:
 * an empty chart is far less useful than the reason it is empty.
 */
export async function fetchUsage(content: string, accountKey: string): Promise<UsageResult> {
  const creds = accessTokenOf(content)
  if (!creds) {
    return { ok: false, code: 'no_token', message: 'Credential này không có access token.' }
  }

  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        authorization: `Bearer ${creds.token}`,
        'chatgpt-account-id': creds.accountId ?? '',
        originator: 'codex_cli_rs',
        accept: 'application/json'
      },
      // Do not let a hanging request stall the whole refresh.
      signal: AbortSignal.timeout(12_000)
    })

    if (!res.ok) {
      let code = `http_${res.status}`
      try {
        const body = (await res.json()) as { error?: { code?: string } }
        if (body.error?.code) code = body.error.code
      } catch {
        // Non-JSON error body; the status alone will have to do.
      }
      return { ok: false, code, message: explain(code, res.status) }
    }

    const raw = (await res.json()) as RawUsage
    const snapshot: UsageSnapshot = {
      accountKey,
      email: raw.email ?? null,
      planType: raw.plan_type ?? null,
      limitReached: Boolean(raw.rate_limit?.limit_reached),
      primary: toWindow(raw.rate_limit?.primary_window),
      secondary: toWindow(raw.rate_limit?.secondary_window),
      creditBalance: raw.credits?.balance ?? null,
      fetchedAt: new Date().toISOString()
    }
    return { ok: true, snapshot }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, code: 'network', message: `Không gọi được API: ${message}` }
  }
}

/** "5 giờ" / "7 ngày" — the window length, read from the response. */
export function windowLabel(seconds: number): string {
  if (!seconds) return 'cửa sổ'
  const hours = Math.round(seconds / 3600)
  if (hours < 24) return `${hours} giờ`
  const days = Math.round(hours / 24)
  return `${days} ngày`
}
