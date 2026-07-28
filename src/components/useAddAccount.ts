'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { StateView } from '@/types'

export type Phase = 'idle' | 'running' | 'capturing' | 'done' | 'error'

/** The sign-in prompt parsed out of the CLI output. */
export interface AuthPrompt {
  url: string
  /** Only the `--device-auth` flow has a one-time code. */
  code?: string
}

/**
 * Long URLs can arrive split across lines. Glue a bare, space-free line back
 * onto the previous one when that line was still inside a URL.
 */
function dewrap(lines: string[]): string {
  const out: string[] = []
  for (const line of lines) {
    const prev = out[out.length - 1]
    if (prev && /https?:\/\/\S*$/.test(prev) && /^\S+$/.test(line) && !/^https?:/.test(line)) {
      out[out.length - 1] = prev + line
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

/**
 * Both login flows print a URL to open:
 *
 *   codex login              -> https://auth.openai.com/oauth/authorize?...
 *   codex login --device-auth -> https://auth.openai.com/codex/device + a code
 *
 * Pull them out so the UI can present them, and so the URL can be opened in a
 * clean browser profile rather than whatever codex decided to launch.
 */
function parseAuthPrompt(lines: string[]): AuthPrompt | null {
  const text = dewrap(lines)
  const url = text.match(/https:\/\/auth\.openai\.com\/\S+/)?.[0]?.replace(/[.,)\]]+$/, '')
  if (!url) return null
  const code = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/)?.[0]
  return { url, code }
}

export interface AddAccount {
  phase: Phase
  /** Human-readable status for the current phase. */
  message: string
  command: string
  lines: string[]
  /** Set once the CLI has printed a URL to sign in at. */
  prompt: AuthPrompt | null
  /** Name of the browser opened privately, if the tool managed to open one. */
  openedIn: string
  /** Re-open the verification URL in a fresh private window. */
  reopen: () => void
  /** True while a codex process is running, so buttons can disable. */
  busy: boolean
  /** Full flow: log in, wait for the browser confirmation, then save. */
  start: (action: 'codex-login' | 'codex-login-device') => Promise<void>
  /** Run a codex command without capturing anything afterwards. */
  run: (action: string) => Promise<void>
  reset: () => void
}

/**
 * Drives the whole add-an-account flow:
 *
 *   spawn `codex login` -> user confirms in their own browser -> codex writes
 *   ~/.codex/auth.json -> capture it into a new profile, named from the
 *   identity inside the credential.
 *
 * The password is only ever typed by the user, in their own browser; this only
 * starts the CLI and reads the file it leaves behind.
 */
export function useAddAccount({
  categoryId,
  presetId,
  onState
}: {
  categoryId: string
  presetId: string
  onState: (state: StateView) => void
}): AddAccount {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const [command, setCommand] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [openedIn, setOpenedIn] = useState('')
  // Whether finishing the job should capture a profile, or just report.
  const captureAfter = useRef(false)
  // The device URL we already auto-opened, so a poll tick cannot open it twice.
  const opened = useRef('')

  const openUrl = useCallback((url: string) => {
    opened.current = url
    api.openPrivate(url).then(
      (r) => setOpenedIn(r.browser),
      () => setOpenedIn('')
    )
  }, [])

  const capture = useCallback(async () => {
    setPhase('capturing')
    setMessage('Đang đọc credential và lưu profile…')
    try {
      const result = await api.captureAccount({ categoryId, presetId })
      onState(result.state)
      setPhase('done')
      setMessage(
        result.duplicate
          ? `Account này đã được lưu sẵn với tên “${result.duplicate}”.`
          : `Đã lưu profile “${result.profile?.name}”.`
      )
    } catch (err) {
      setPhase('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [categoryId, presetId, onState])

  // Poll the running job; when it exits, either capture or just report.
  useEffect(() => {
    if (!jobId || phase !== 'running') return
    const timer = setInterval(async () => {
      try {
        const job = await api.job(jobId)
        setLines(job.lines)

        // As soon as the CLI prints the sign-in URL, open it in a clean profile
        // so the login does not inherit another account's session.
        const found = parseAuthPrompt(job.lines)
        if (found && opened.current !== found.url) openUrl(found.url)

        if (!job.done) return
        clearInterval(timer)
        setJobId(null)
        if (job.code === 0) {
          if (captureAfter.current) {
            capture()
          } else {
            setPhase('done')
            setMessage('Xong.')
          }
        } else {
          setPhase('error')
          setMessage(`codex thoát với mã ${job.code}. Xem output bên dưới.`)
        }
      } catch {
        clearInterval(timer)
        setPhase('error')
        setMessage('Mất kết nối với job đang chạy.')
      }
    }, 700)
    return () => clearInterval(timer)
  }, [jobId, phase, capture, openUrl])

  const launch = useCallback(async (action: string, withCapture: boolean) => {
    captureAfter.current = withCapture
    opened.current = ''
    setOpenedIn('')
    setLines([])
    setPhase('running')
    setMessage(
      withCapture
        ? 'Đang chạy codex login. Xác nhận trong cửa sổ ẩn danh vừa mở, rồi quay lại đây.'
        : 'Đang chạy…'
    )
    try {
      const job = await api.startJob(action)
      setCommand(job.command)
      setJobId(job.jobId)
    } catch (err) {
      setPhase('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const prompt = phase === 'running' ? parseAuthPrompt(lines) : null

  return {
    phase,
    message,
    command,
    lines,
    prompt,
    openedIn,
    reopen: () => {
      if (prompt) openUrl(prompt.url)
    },
    busy: phase === 'running' || phase === 'capturing',
    start: (action) => launch(action, true),
    run: (action) => launch(action, false),
    reset: () => {
      setPhase('idle')
      setMessage('')
      setLines([])
      setCommand('')
      setOpenedIn('')
      opened.current = ''
    }
  }
}
