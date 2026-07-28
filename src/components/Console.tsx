'use client'

import { useEffect, useRef, useState } from 'react'
import { IconArrowRight, IconCheck, IconKey, IconLogout, IconRefresh, IconTerminal } from './icons'
import { Button, Card, CardHead, Pill } from './ui'
import type { AddAccount } from './useAddAccount'

/**
 * The add-an-account surface. Device code is the primary path: `codex login`
 * opens the OS default browser with its default profile, which for a
 * multi-account tool means it silently re-authorises whoever is already signed
 * in there. With a device code the user picks where to open it — an incognito
 * window, another Chrome profile, another browser, a phone.
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
  const [copied, setCopied] = useState(false)
  const boxRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [add.lines])

  // Clear the "copied" flag on a timer rather than leaving it stuck on.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

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
        <Button
          variant="pill"
          onClick={() => add.start('codex-login-device')}
          disabled={add.busy}
          title="Cần bật xác thực mã thiết bị trong Cài đặt bảo mật ChatGPT của account đó"
        >
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

      {/* The sign-in prompt, lifted out of the raw output. */}
      {add.prompt && (
        <div className="mt-4 rounded-2xl border border-accent/25 bg-accent/8 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
              {add.prompt.code ? 'bước 1 — trang xác nhận' : 'đăng nhập ở cửa sổ này'}
            </span>
            {add.openedIn ? (
              <Pill tone="ok">
                <IconCheck className="size-[11px] shrink-0" />
                đã mở {add.openedIn} với profile trắng
              </Pill>
            ) : (
              <Pill tone="warn">chưa mở được browser</Pill>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="pill" onClick={add.reopen}>
              Mở lại cửa sổ mới
            </Button>
            <a
              href={add.prompt.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-dim underline decoration-line2 underline-offset-4 transition-colors hover:text-fg hover:decoration-accent"
            >
              {add.prompt.url.length > 64 ? `${add.prompt.url.slice(0, 64)}…` : add.prompt.url}
              <IconArrowRight className="size-[12px] text-accent" />
            </a>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-dim text-pretty">
            Cửa sổ này dùng profile trắng, tạo mới mỗi lần — không mang theo cookie hay session
            ChatGPT nào. Nên mỗi lần thêm account bạn đều được hỏi đăng nhập từ đầu.
            <span className="mt-1 block text-faint">
              Không dùng chế độ ẩn danh vì Chrome sẽ nhập vào cửa sổ ẩn danh đang mở và kế thừa
              luôn session của account trước.
            </span>
          </p>

          {/* Only the device flow has a code to type. */}
          {add.prompt.code && (
            <>
              <div className="mt-4 text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
                bước 2 — nhập mã
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <code className="rounded-lg border border-line2/70 bg-sunken px-3 py-2 font-mono text-[19px] tracking-[0.14em] text-fg">
                  {add.prompt.code}
                </code>
                <Button
                  variant="pill"
                  onClick={() => {
                    const code = add.prompt?.code
                    if (!code) return
                    navigator.clipboard?.writeText(code).then(
                      () => setCopied(true),
                      () => setCopied(false)
                    )
                  }}
                >
                  {copied ? (
                    <>
                      <IconCheck className="size-[13px] text-accent" />
                      đã copy
                    </>
                  ) : (
                    'Copy mã'
                  )}
                </Button>
                <span className="text-[11.5px] text-faint">mã hết hạn sau 15 phút</span>
              </div>
            </>
          )}

          {!add.prompt.code && (
            <p className="mt-2.5 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[12px] leading-relaxed text-warn text-pretty">
              Codex cũng tự mở browser mặc định của bạn — bỏ qua cửa sổ đó và đăng nhập ở cửa sổ
              profile trắng, nếu không nó sẽ dùng lại account đang đăng nhập sẵn.
            </p>
          )}
        </div>
      )}

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
            {!add.busy && (
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
