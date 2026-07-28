import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { BACKUP_DIR, HOME, IS_WINDOWS, resolvePath } from './paths'
import { writeAtomic } from './storage'
import type {
  ConfigItem,
  EnvVarItem,
  FileReplaceItem,
  ItemResult,
  Profile,
  RunCommandItem,
  SwitchResult
} from '@/types'

interface BackupMeta {
  id: string
  profileId: string
  profileName: string
  timestamp: string
  files: string[]
}

/**
 * Only one switch may run at a time. Kept on globalThis so the lock survives
 * the module reloads that Next's dev server performs between requests.
 */
const lock = globalThis as typeof globalThis & { __codexSwitchBusy?: boolean }

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Backup / rollback ─────────────────────────────────────────────

/** Files are named by base64url of their absolute path, so nesting can't collide. */
const encodeName = (p: string) => Buffer.from(p).toString('base64url')

async function createBackup(profile: Profile): Promise<BackupMeta> {
  const targets = new Set<string>()
  for (const item of profile.items.filter((i) => i.enabled)) {
    if (item.type === 'file-replace') targets.add(resolvePath(item.targetPath))
    else if (item.type === 'env-var') targets.add(resolvePath(item.shellFile))
  }

  const timestamp = new Date().toISOString()
  const id = `${timestamp.replace(/[:.]/g, '-')}_${profile.id}`
  const dir = join(BACKUP_DIR, id)
  await mkdir(dir, { recursive: true })

  const files: string[] = []
  for (const target of targets) {
    // A file that doesn't exist yet needs no backup — it's simply created.
    if (!existsSync(target)) continue
    await copyFile(target, join(dir, encodeName(target)))
    files.push(target)
  }

  const meta: BackupMeta = {
    id,
    profileId: profile.id,
    profileName: profile.name,
    timestamp,
    files
  }
  await writeAtomic(join(dir, '_meta.json'), JSON.stringify(meta, null, 2))
  return meta
}

export async function restoreBackup(backupId: string): Promise<void> {
  const dir = join(BACKUP_DIR, backupId)
  const meta = JSON.parse(await readFile(join(dir, '_meta.json'), 'utf8')) as BackupMeta
  for (const target of meta.files) {
    await mkdir(dirname(target), { recursive: true })
    // Copy to a temp neighbour then rename, so a crash mid-restore can't
    // corrupt the original.
    const tmp = join(dirname(target), `.codex-switch-restore-${basename(target)}.tmp`)
    await copyFile(join(dir, encodeName(target)), tmp)
    await rename(tmp, target)
  }
}

// ── Item handlers ─────────────────────────────────────────────────

async function applyFileReplace(item: FileReplaceItem): Promise<ItemResult> {
  const base = { itemId: item.id, type: item.type, label: item.label } as const
  const target = resolvePath(item.targetPath)
  try {
    if (!item.content) {
      throw new Error('Item chưa có nội dung — bấm "Import từ đĩa" để chụp file hiện tại trước')
    }
    await mkdir(dirname(target), { recursive: true })
    const tmp = join(dirname(target), `.codex-switch-${basename(target)}.tmp`)
    await writeFile(tmp, item.content, 'utf8')
    await rename(tmp, target)
    return { ...base, success: true }
  } catch (err) {
    return { ...base, success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Write `NAME=value` into a shell config file, replacing an existing
 * uncommented assignment if there is one. Commented lines are left alone.
 * Syntax follows the shell: `export NAME="v"` on POSIX, `$env:NAME = "v"` on
 * Windows PowerShell.
 */
async function applyEnvVar(item: EnvVarItem): Promise<ItemResult> {
  const base = { itemId: item.id, type: item.type, label: item.label } as const
  const file = resolvePath(item.shellFile)
  try {
    if (!ENV_NAME_RE.test(item.name)) {
      throw new Error(`Tên biến môi trường không hợp lệ: "${item.name}"`)
    }

    const escaped = item.value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')

    const name = escapeRegex(item.name)
    const line = IS_WINDOWS
      ? `$env:${item.name} = "${escaped}"`
      : `export ${item.name}="${escaped}"`
    const active = IS_WINDOWS
      ? new RegExp(`^\\$env:${name}\\s*=.*$`, 'gm')
      : new RegExp(`^export\\s+${name}=.*$`, 'gm')

    let content = ''
    try {
      content = await readFile(file, 'utf8')
    } catch {
      // New shell file — created below.
    }

    let next: string
    if (active.test(content)) {
      next = content.replace(active, line)
    } else {
      const sep = content.length && !content.endsWith('\n') ? '\n' : ''
      next = `${content}${sep}${line}\n`
    }

    await mkdir(dirname(file), { recursive: true })
    const tmp = join(dirname(file), `.codex-switch-${basename(file)}.tmp`)
    await writeFile(tmp, next, 'utf8')
    await rename(tmp, file)
    return { ...base, success: true }
  } catch (err) {
    return { ...base, success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function runCommand(item: RunCommandItem): Promise<ItemResult> {
  const base = { itemId: item.id, type: item.type, label: item.label } as const
  const cwd = item.workingDir ? resolvePath(item.workingDir) : HOME
  const timeout = item.timeout ?? 30_000

  return new Promise((resolve) => {
    const [cmd, args] = IS_WINDOWS
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', item.command]]
      : ['sh', ['-c', item.command]]

    const child = spawn(cmd, args as string[], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))

    // SIGTERM at the deadline, SIGKILL five seconds later if it ignores that.
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 5_000)
    }, timeout)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ...base, success: false, error: err.message, stdout, stderr })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (killed) {
        resolve({ ...base, success: false, error: `Timeout sau ${timeout}ms`, stdout, stderr })
      } else if (code === 0) {
        resolve({ ...base, success: true, stdout, stderr })
      } else {
        resolve({ ...base, success: false, error: `Exit code ${code}`, stdout, stderr })
      }
    })
  })
}

// ── Orchestration ─────────────────────────────────────────────────

const isType = <T extends ConfigItem['type']>(type: T) =>
  (item: ConfigItem): item is Extract<ConfigItem, { type: T }> =>
    item.type === type

export async function switchProfile(profile: Profile): Promise<SwitchResult> {
  if (lock.__codexSwitchBusy) throw new Error('Đang có một lần switch khác chạy — thử lại sau')
  lock.__codexSwitchBusy = true
  try {
    const enabled = profile.items.filter((i) => i.enabled)
    const backup = await createBackup(profile)
    const results: ItemResult[] = []
    let failed = false

    // Phase 1 — file replacements. Reversible, so a failure rolls back.
    for (const item of enabled.filter(isType('file-replace'))) {
      const result = await applyFileReplace(item)
      results.push(result)
      if (!result.success) {
        failed = true
        break
      }
    }

    // Phase 2 — env vars. Also reversible.
    if (!failed) {
      for (const item of enabled.filter(isType('env-var'))) {
        const result = await applyEnvVar(item)
        results.push(result)
        if (!result.success) {
          failed = true
          break
        }
      }
    }

    if (failed) {
      await restoreBackup(backup.id)
      return { profileId: profile.id, backupId: backup.id, results, success: false, rolledBack: true }
    }

    // Phase 3 — commands. Side effects can't be undone, so no rollback here.
    for (const item of enabled.filter(isType('run-command'))) {
      const result = await runCommand(item)
      results.push(result)
      if (!result.success) {
        failed = true
        break
      }
    }

    return {
      profileId: profile.id,
      backupId: backup.id,
      results,
      success: !failed,
      rolledBack: false
    }
  } finally {
    lock.__codexSwitchBusy = false
  }
}
