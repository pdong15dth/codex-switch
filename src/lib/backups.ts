import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_DIR } from './paths'
import type { BackupEntry } from '@/types'

/**
 * Every switch writes a backup directory containing `_meta.json`, so the backup
 * folder doubles as the app's switch history. Read newest first.
 */
export async function listBackups(limit = 200): Promise<BackupEntry[]> {
  let dirs: string[]
  try {
    dirs = await readdir(BACKUP_DIR)
  } catch {
    return []
  }

  const entries: BackupEntry[] = []
  // Directory ids start with an ISO timestamp, so lexical sort is chronological.
  for (const dir of dirs.sort().reverse().slice(0, limit)) {
    try {
      const meta = JSON.parse(await readFile(join(BACKUP_DIR, dir, '_meta.json'), 'utf8')) as {
        id: string
        profileId: string
        profileName: string
        timestamp: string
        files: string[]
      }
      entries.push({
        id: meta.id,
        profileId: meta.profileId,
        profileName: meta.profileName,
        timestamp: meta.timestamp,
        fileCount: meta.files?.length ?? 0
      })
    } catch {
      // A half-written or hand-deleted backup is not worth failing the page for.
    }
  }
  return entries
}
