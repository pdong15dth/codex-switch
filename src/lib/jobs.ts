import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { delimiter, join } from 'node:path'
import { HOME } from './paths'
import { prepareLoginSlot, settleLoginSlot } from './login-slot'

export interface Job {
  id: string
  command: string
  lines: string[]
  done: boolean
  code: number | null
}

/** Kept on globalThis so jobs survive Next dev-server module reloads. */
const store = globalThis as typeof globalThis & { __codexSwitchJobs?: Map<string, Job> }
store.__codexSwitchJobs ??= new Map()
const jobs = store.__codexSwitchJobs

/**
 * codex colours its output, and those escape sequences render as literal
 * `[90m` noise in the browser. Built from a char code so the pattern does not
 * embed a raw control character.
 */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')

const stripAnsi = (s: string) => s.replace(ANSI, '')

/**
 * The dashboard often runs under launchd/systemd with a bare PATH, while
 * user-level CLIs live in ~/.local/bin (codex standalone) or Homebrew/npm
 * prefixes — spawn with an augmented PATH so `codex` / `claude` resolve.
 */
const jobEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: [
    join(HOME, '.local', 'bin'),
    join(HOME, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH ?? ''
  ].join(delimiter)
})

/**
 * Whitelisted commands only — nothing from the request reaches the argv.
 *
 * No `codex logout` on purpose: logout revokes the credential server-side,
 * killing the same token pair stored in profiles. Login actions move the
 * live auth.json aside instead (see login-slot.ts).
 */
export const JOB_ACTIONS: Record<string, { bin: string; args: string[]; loginSlot?: boolean }> = {
  'codex-login': { bin: 'codex', args: ['login'], loginSlot: true },
  'codex-login-device': { bin: 'codex', args: ['login', '--device-auth'], loginSlot: true },
  'codex-status': { bin: 'codex', args: ['login', 'status'] },
  'claude-login': { bin: 'claude', args: ['/login'] }
}

export async function startJob(action: string): Promise<Job> {
  const spec = JOB_ACTIONS[action]
  if (!spec) throw new Error(`Action không hợp lệ: ${action}`)

  // Clear the slot before the CLI starts so the new login never has to
  // revoke (or even see) the account currently on disk.
  if (spec.loginSlot) await prepareLoginSlot()

  const job: Job = {
    id: randomUUID(),
    command: `${spec.bin} ${spec.args.join(' ')}`,
    lines: [],
    done: false,
    code: null
  }
  jobs.set(job.id, job)

  // shell:true so Windows resolves codex.exe / claude.exe from PATH.
  const child = spawn(spec.bin, spec.args, { shell: true, windowsHide: true, env: jobEnv() })

  const push = (buf: Buffer) => {
    for (const raw of buf.toString().split(/\r?\n/)) {
      const line = stripAnsi(raw).trimEnd()
      if (line.length) job.lines.push(line)
    }
    if (job.lines.length > 500) job.lines.splice(0, job.lines.length - 500)
  }
  child.stdout?.on('data', push)
  child.stderr?.on('data', push)

  child.on('error', (err) => {
    job.lines.push(`[lỗi] không chạy được ${spec.bin}: ${err.message}`)
    job.done = true
    job.code = -1
  })
  child.on('close', (code) => {
    job.done = true
    job.code = code
    // Restore the aside credential when the login produced nothing. Fire and
    // forget: the client only captures after a successful login anyway.
    if (spec.loginSlot) {
      settleLoginSlot().catch((err) => {
        job.lines.push(
          `[lỗi] không khôi phục được auth.json: ${err instanceof Error ? err.message : String(err)}`
        )
      })
    }
  })

  // Never let a job hang forever; OAuth flows are interactive but bounded.
  setTimeout(() => {
    if (!job.done) {
      child.kill()
      job.lines.push('[hết thời gian] đã dừng sau 10 phút')
      job.done = true
      job.code = -1
    }
  }, 600_000)

  return job
}

export const getJob = (id: string) => jobs.get(id)
