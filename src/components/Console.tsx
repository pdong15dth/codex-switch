'use client'

import { useEffect, useRef } from 'react'
import { IconCheck, IconKey, IconLogout, IconRefresh, IconTerminal } from './icons'
import { Button, Card, CardHead, Pill } from './ui'
import type { AddAccount } from './useAddAccount'

/**
 * The add-an-account surface. One primary button runs the whole flow — spawn
 * `codex login`, wait while the user confirms in their own browser, then save
 * the credential as a profile — and the CLI output streams underneath.
 */
export function ConsoleCard({
  add,
  index,
  className = ''
}: {
  add: AddAccount
  index: number
  className?: string
}) {
  const boxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [add.lines])

  const status =
    add.phase === 'running' ? (
      <Pill tone="warn">
        <span className="pulse-dot size-[6px] rounded-full bg-warn" aria-hidden />
        đang chờ bạn xác nhận
      </Pill>
    ) : add.phase === 'capturing' ? (
      <Pill tone="info">đang lưu</Pill>
    ) : add.phase === 'done' ? (
      <Pill tone="ok">
        <IconCheck className="size-[11px]" />
        xong
      </Pill>
    ) : add.phase === 'error' ? (
      <Pill tone="bad">lỗi</Pill>
    ) : undefined

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Thêm account"
        sub="login bằng Codex CLI rồi lưu thành profile"
        right={status}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => add.start('codex-login')} disabled={add.busy}>
          <IconKey className="size-[14px]" />
          Login &amp; lưu profile
        </Button>
        <Button variant="pill" onClick={() => add.start('codex-login-device')} disabled={add.busy}>
          Dùng device code
        </Button>
        <span className="grow" />
        <Button variant="pill" onClick={() => add.run('codex-status')} disabled={add.busy}>
          <IconRefresh className="size-[14px]" />
          Status
        </Button>
        <Button variant="pill" onClick={() => add.run('codex-logout')} disabled={add.busy}>
          <IconLogout className="size-[14px]" />
          Logout
        </Button>
      </div>

      {add.message && (
        <p
          className={`mt-3.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-pretty ${
            add.phase === 'error'
              ? 'border-bad/35 bg-bad/10 text-[#f0aca2]'
              : add.phase === 'done'
                ? 'border-accent/30 bg-accent/8 text-accent'
                : 'border-line bg-raised/50 text-dim'
          }`}
        >
          {add.message}
        </p>
      )}

      {(add.lines.length > 0 || add.phase === 'running') && (
        <div className="mt-3.5 overflow-hidden rounded-xl border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-raised/60 px-3.5 py-2">
            <IconTerminal className="size-[13px] shrink-0 text-faint" />
            <span className="grow truncate font-mono text-[11px] text-faint">{add.command}</span>
            {add.phase !== 'running' && add.phase !== 'capturing' && (
              <button
                onClick={add.reset}
                aria-label="Xoá output"
                className="cursor-pointer rounded px-1 text-[11px] text-faint transition-colors hover:text-fg"
              >
                ✕
              </button>
            )}
          </div>
          <pre
            ref={boxRef}
            className="max-h-56 overflow-auto bg-sunken px-3.5 py-3 font-mono text-[11.5px] leading-[1.65] break-words whitespace-pre-wrap text-dim"
          >
            {add.lines.join('\n') || 'Đang chạy…'}
          </pre>
        </div>
      )}
    </Card>
  )
}
