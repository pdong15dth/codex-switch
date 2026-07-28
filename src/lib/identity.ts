import type { Identity } from '@/types'

/** The subset of credential-file shapes this module probes for. */
interface AuthFile {
  auth_mode?: string
  OPENAI_API_KEY?: string | null
  tokens?: { id_token?: string; account_id?: string }
  last_refresh?: string
  claudeAiOauth?: { subscriptionType?: string; expiresAt?: number }
  oauthAccount?: { emailAddress?: string }
}

interface IdTokenClaims {
  /** Subject: stable per-account identifier. */
  sub?: string
  email?: string
  name?: string
  /** Issued-at, so the token's real lifetime can be measured. */
  iat?: number
  exp?: number
  'https://api.openai.com/auth'?: { chatgpt_plan_type?: string; chatgpt_account_id?: string }
  'https://api.openai.com/profile'?: { email?: string }
}

function decodeJwtPayload(token: string): IdTokenClaims | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json) as IdTokenClaims
  } catch {
    return null
  }
}

const mask = (secret: string) =>
  secret.length > 12 ? `${secret.slice(0, 6)}…${secret.slice(-4)}` : 'đã lưu'

/**
 * Summarise a credential file for display. Never returns a raw token — only an
 * auth mode, a human-readable label (email when derivable, otherwise a masked
 * key), plan and expiry.
 *
 * Recognises Codex `auth.json` (both `chatgpt` and `apikey` modes) and Claude
 * Code `.credentials.json` / `.claude.json`.
 */
export function describeAuth(content: string): Identity | null {
  if (!content.trim()) return null

  let data: AuthFile
  try {
    data = JSON.parse(content) as AuthFile
  } catch {
    return null
  }

  // Codex — ChatGPT OAuth
  if (data.tokens?.id_token) {
    const claims = decodeJwtPayload(data.tokens.id_token) ?? {}
    const auth = claims['https://api.openai.com/auth'] ?? {}
    const profile = claims['https://api.openai.com/profile'] ?? {}
    const accountId = data.tokens.account_id ?? auth.chatgpt_account_id
    const email = claims.email ?? profile.email
    return {
      authMode: 'chatgpt',
      accountKey: claims.sub ?? email ?? accountId ?? null,
      label: email || (accountId ? `account ${accountId.slice(0, 8)}…` : 'ChatGPT account'),
      displayName: claims.name ?? null,
      plan: auth.chatgpt_plan_type ?? null,
      expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
      issuedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
      lastRefresh: data.last_refresh ?? null
    }
  }

  // Codex — API key
  if (data.OPENAI_API_KEY) {
    return {
      authMode: data.auth_mode ?? 'apikey',
      // A key never rotates, so it identifies itself.
      accountKey: data.OPENAI_API_KEY,
      label: mask(data.OPENAI_API_KEY),
      plan: null,
      expiresAt: null
    }
  }

  // Claude Code — .credentials.json
  if (data.claudeAiOauth) {
    const { subscriptionType, expiresAt } = data.claudeAiOauth
    return {
      authMode: 'claude-oauth',
      accountKey: subscriptionType ? `claude:${subscriptionType}` : 'claude',
      label: subscriptionType ? `Claude ${subscriptionType}` : 'Claude account',
      plan: subscriptionType ?? null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
    }
  }

  // Claude Code — .claude.json carries the account identity
  if (data.oauthAccount) {
    return {
      authMode: 'claude-account',
      accountKey: data.oauthAccount.emailAddress ?? null,
      label: data.oauthAccount.emailAddress || 'Claude account',
      plan: null,
      expiresAt: null
    }
  }

  return {
    authMode: data.auth_mode ?? 'unknown',
    accountKey: null,
    label: '—',
    plan: null,
    expiresAt: null
  }
}
