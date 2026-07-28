import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

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

/** Whitelisted commands only — nothing from the request reaches the argv. */
export const JOB_ACTIONS: Record<string, { bin: string; args: string[] }> = {
  'codex-login': { bin: 'codex', args: ['login'] },
  'codex-login-device': { bin: 'codex', args: ['login', '--device-auth'] },
  'codex-status': { bin: 'codex', args: ['login', 'status'] },
  'codex-logout': { bin: 'codex', args: ['logout'] },
  'claude-login': { bin: 'claude', args: ['/login'] }
}

export function startJob(action: string): Job {
  const spec = JOB_ACTIONS[action]
  if (!spec) throw new Error(`Action không hợp lệ: ${action}`)

  const job: Job = {
    id: randomUUID(),
    command: `${spec.bin} ${spec.args.join(' ')}`,
    lines: [],
    done: false,
    code: null
  }
  jobs.set(job.id, job)

  // shell:true so Windows resolves codex.exe / claude.exe from PATH.
  const child = spawn(spec.bin, spec.args, { shell: true, windowsHide: true })

  const push = (buf: Buffer) => {
    for (const line of buf.toString().split(/\r?\n/)) if (line.length) job.lines.push(line)
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
