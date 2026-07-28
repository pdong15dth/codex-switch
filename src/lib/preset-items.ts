import { randomUUID } from 'node:crypto'
import { defaultShellFile } from './paths'
import type { ConfigItem, PresetDefaultItem } from '@/types'

/** Expand a preset template row into a real config item with an id. */
export function toConfigItem(row: PresetDefaultItem): ConfigItem {
  const base = { id: randomUUID(), label: row.label, enabled: row.enabled }

  if (row.type === 'file-replace') {
    return { ...base, type: 'file-replace', targetPath: row.targetPath ?? '', content: '' }
  }
  if (row.type === 'env-var') {
    return {
      ...base,
      type: 'env-var',
      name: row.name ?? '',
      value: row.value ?? '',
      shellFile: row.shellFile ?? defaultShellFile()
    }
  }
  return {
    ...base,
    type: 'run-command',
    command: row.command ?? '',
    workingDir: row.workingDir,
    timeout: row.timeout
  }
}

/**
 * Pick a profile name from a credential identity: the local part of an email
 * when there is one, otherwise `acc1`, `acc2`, … Always returns a name not
 * already used in the category.
 */
export function deriveProfileName(identityLabel: string | undefined, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))

  const email = identityLabel?.match(/^([^@\s]+)@[^@\s]+$/)
  if (email) {
    const base = email[1].replace(/[^\p{L}\p{N}._-]/gu, '')
    // Skip generated-looking locals such as `skating_wander.09qxadbxon`: they
    // make a worse label than acc1/acc2, and the email is shown alongside
    // anyway. Anything reasonably short still wins.
    if (base && base.length <= 14) {
      if (!used.has(base.toLowerCase())) return base
      for (let i = 2; i < 100; i++) {
        const candidate = `${base}-${i}`
        if (!used.has(candidate.toLowerCase())) return candidate
      }
    }
  }

  for (let i = 1; i < 1000; i++) {
    const candidate = `acc${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `acc-${Date.now()}`
}
