/**
 * Data model, mirroring the profile → config-items design from xoay-config.
 * A profile is a named set of config items; switching applies them to disk.
 */

// ── Config items ──────────────────────────────────────────────────

export interface BaseConfigItem {
  id: string
  label: string
  enabled: boolean
}

export interface FileReplaceItem extends BaseConfigItem {
  type: 'file-replace'
  targetPath: string
  content: string
}

export interface EnvVarItem extends BaseConfigItem {
  type: 'env-var'
  name: string
  value: string
  shellFile: string
}

export interface RunCommandItem extends BaseConfigItem {
  type: 'run-command'
  command: string
  workingDir?: string
  timeout?: number
}

export type ConfigItem = FileReplaceItem | EnvVarItem | RunCommandItem

// ── Category / Profile ────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  builtIn: boolean
  createdAt: string
  updatedAt: string
}

/** TOTP settings for an account's two-factor code. */
export interface TotpConfig {
  /** Base32 shared secret. Stays on the server; never sent to the browser. */
  secret: string
  digits: number
  period: number
  algorithm: string
  label?: string | null
}

export interface Profile {
  id: string
  name: string
  categoryId: string
  presetId?: string
  items: ConfigItem[]
  /** Optional 2FA secret, so the code can be generated when signing in. */
  totp?: TotpConfig | null
  createdAt: string
  updatedAt: string
}

// ── Presets ───────────────────────────────────────────────────────

export interface PresetDefaultItem {
  type: ConfigItem['type']
  label: string
  enabled: boolean
  targetPath?: string
  name?: string
  value?: string
  shellFile?: string
  command?: string
  workingDir?: string
  timeout?: number
}

export interface Preset {
  id: string
  name: string
  description: string
  categoryName: string
  defaultItems: PresetDefaultItem[]
}

// ── Switch results ────────────────────────────────────────────────

export interface ItemResult {
  itemId: string
  type?: ConfigItem['type']
  label?: string
  success: boolean
  error?: string
  stdout?: string
  stderr?: string
}

export interface SwitchResult {
  profileId: string
  backupId: string
  results: ItemResult[]
  success: boolean
  rolledBack: boolean
}

// ── Persisted state ───────────────────────────────────────────────

export interface AppState {
  schemaVersion: number
  categories: Category[]
  profiles: Profile[]
  /** categoryId → profileId of the profile last switched in for that category. */
  activeProfileIds: Record<string, string>
  /** accountKey → last quota read, kept so inactive accounts still show a figure. */
  usage?: Record<string, UsageSnapshot>
}

// ── View models sent to the browser ───────────────────────────────

/** Credential summary derived from an auth file — never includes raw tokens. */
export interface Identity {
  authMode: string
  /**
   * Stable per-account id (the `sub` claim, else the email). Tokens rotate, so
   * identity — not file content — is what says two credentials are the same
   * account.
   */
  accountKey?: string | null
  /** Email when derivable, otherwise a masked key. */
  label: string
  /** Display name from the token, when the provider includes one. */
  displayName?: string | null
  plan?: string | null
  expiresAt?: string | null
  /** Token issue time, so the real lifetime is known instead of assumed. */
  issuedAt?: string | null
  /** When the CLI last refreshed this credential. */
  lastRefresh?: string | null
}

export interface ProfileView extends Omit<Profile, 'items' | 'totp'> {
  items: ConfigItemView[]
  /** Whether a 2FA secret is stored — never the secret itself. */
  hasTotp: boolean
  /** True when the credential on disk belongs to this profile's account. */
  active: boolean
  identity: Identity | null
  /** Last quota read for this account; stale for inactive ones. */
  usage: UsageSnapshot | null
}

export type ConfigItemView = ConfigItem & {
  /** file-replace only: whether targetPath currently holds this item's content. */
  matchesDisk?: boolean
  /** file-replace only: whether the item has captured content yet. */
  hasContent?: boolean
  /** file-replace only: whether targetPath exists on disk. */
  targetExists?: boolean
}

// ── Quota / usage ─────────────────────────────────────────────────

export interface UsageWindow {
  usedPercent: number
  /** Length of the rate-limit window, e.g. 18000 (5h) or 604800 (7d). */
  windowSeconds: number
  resetAt: string | null
}

/** Quota read from the backend for one account, plus when it was read. */
export interface UsageSnapshot {
  accountKey: string
  email: string | null
  planType: string | null
  limitReached: boolean
  primary: UsageWindow | null
  secondary: UsageWindow | null
  creditBalance: string | null
  fetchedAt: string
}

/** One recorded switch — the backup folder is also the history log. */
export interface BackupEntry {
  id: string
  profileId: string
  profileName: string
  timestamp: string
  fileCount: number
}

export interface StateView {
  platform: string
  home: string
  dataDir: string
  /** Server render time. The client seeds its clock from this, then ticks. */
  now: number
  categories: Category[]
  profiles: ProfileView[]
  activeProfileIds: Record<string, string>
  backups: BackupEntry[]
}
