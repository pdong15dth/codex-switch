'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import type { StateView } from '@/types'

export type Phase = 'idle' | 'running' | 'capturing' | 'done' | 'error'

export interface AddAccount {
  phase: Phase
  /** Human-readable status for the current phase. */
  message: string
  command: string
  lines: string[]
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
  // Whether finishing the job should capture a profile, or just report.
  const captureAfter = useRef(false)

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
  }, [jobId, phase, capture])

  const launch = useCallback(async (action: string, withCapture: boolean) => {
    captureAfter.current = withCapture
    setLines([])
    setPhase('running')
    setMessage(
      withCapture
        ? 'Đang chạy codex login. Xác nhận trong browser vừa mở, rồi quay lại đây.'
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

  return {
    phase,
    message,
    command,
    lines,
    busy: phase === 'running' || phase === 'capturing',
    start: (action) => launch(action, true),
    run: (action) => launch(action, false),
    reset: () => {
      setPhase('idle')
      setMessage('')
      setLines([])
      setCommand('')
    }
  }
}
