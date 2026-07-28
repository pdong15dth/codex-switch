'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import { IconLogout, IconKey, IconRefresh, IconTerminal } from './icons'
import { Button, Card, CardHead, Pill } from './ui'

const ACTIONS = [
  { id: 'codex-login', label: 'Login (browser)', Icon: IconKey },
  { id: 'codex-login-device', label: 'Device code', Icon: IconKey },
  { id: 'codex-status', label: 'Status', Icon: IconRefresh },
  { id: 'codex-logout', label: 'Logout', Icon: IconLogout }
]

/**
 * Runs the whitelisted `codex` auth commands and streams their output. The user
 * completes the OAuth flow in their own browser; this only spawns the CLI.
 */
export function ConsoleCard({
  onFinished,
  index,
  className = ''
}: {
  onFinished: () => void
  index: number
  className?: string
}) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [done, setDone] = useState(true)
  const [code, setCode] = useState<number | null>(null)
  const [error, setError] = useState('')
  const boxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!jobId || done) return
    const timer = setInterval(async () => {
      try {
        const job = await api.job(jobId)
        setLines(job.lines)
        setDone(job.done)
        setCode(job.code)
        if (job.done) onFinished()
      } catch {
        setDone(true)
      }
    }, 700)
    return () => clearInterval(timer)
  }, [jobId, done, onFinished])

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [lines])

  const run = async (action: string) => {
    setError('')
    setLines([])
    setCode(null)
    try {
      const job = await api.startJob(action)
      setJobId(job.jobId)
      setCommand(job.command)
      setDone(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Codex CLI"
        sub="đăng nhập account mới rồi lưu thành profile"
        right={
          command ? (
            done ? (
              code === 0 ? (
                <Pill tone="ok">xong</Pill>
              ) : (
                <Pill tone="bad">exit {code}</Pill>
              )
            ) : (
              <Pill tone="warn">
                <span className="pulse-dot size-[6px] rounded-full bg-warn" aria-hidden />
                đang chạy
              </Pill>
            )
          ) : undefined
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS.map(({ id, label, Icon }) => (
          <Button key={id} variant="pill" onClick={() => run(id)} disabled={!done}>
            <Icon className="size-[14px]" />
            {label}
          </Button>
        ))}
      </div>

      {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}

      {(lines.length > 0 || !done) && (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-raised/60 px-3.5 py-2">
            <IconTerminal className="size-[13px] shrink-0 text-faint" />
            <span className="truncate font-mono text-[11px] text-faint">{command}</span>
          </div>
          <pre
            ref={boxRef}
            className="max-h-56 overflow-auto bg-sunken px-3.5 py-3 font-mono text-[11.5px] leading-[1.65] break-words whitespace-pre-wrap text-dim"
          >
            {lines.join('\n') || 'Đang chạy…'}
          </pre>
        </div>
      )}
    </Card>
  )
}
