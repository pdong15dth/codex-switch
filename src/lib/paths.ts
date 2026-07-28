import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export const HOME = homedir()
export const IS_WINDOWS = platform() === 'win32'

export const DATA_DIR = join(HOME, '.codex-switch')
export const STATE_FILE = join(DATA_DIR, 'state.json')
export const BACKUP_DIR = join(DATA_DIR, 'backups')

/**
 * Expand a leading `~/` to the home directory. Everything else is returned
 * untouched, so absolute paths work as written.
 */
export function resolvePath(p: string): string {
  if (p.startsWith('~/')) return join(HOME, p.slice(2))
  return p
}

/**
 * Default shell file for env-var items. xoay-config hardcodes `~/.zshrc`, which
 * does not exist on Windows and is read by no Windows shell — so pick the
 * PowerShell profile there instead.
 */
export function defaultShellFile(): string {
  return IS_WINDOWS
    ? '~/Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1'
    : '~/.zshrc'
}
