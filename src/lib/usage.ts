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

/**
 * Read quota for one credential. Returns null on any failure — an inactive
 * account's access token expires after an hour, and a 401 there is expected
 * rather than exceptional.
 */
export async function fetchUsage(
  content: string,
  accountKey: string
): Promise<UsageSnapshot | null> {
  const creds = accessTokenOf(content)
  if (!creds) return null

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
    if (!res.ok) return null

    const raw = (await res.json()) as RawUsage
    return {
      accountKey,
      email: raw.email ?? null,
      planType: raw.plan_type ?? null,
      limitReached: Boolean(raw.rate_limit?.limit_reached),
      primary: toWindow(raw.rate_limit?.primary_window),
      secondary: toWindow(raw.rate_limit?.secondary_window),
      creditBalance: raw.credits?.balance ?? null,
      fetchedAt: new Date().toISOString()
    }
  } catch {
    return null
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
