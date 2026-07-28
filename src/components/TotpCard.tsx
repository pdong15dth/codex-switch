'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import { IconCheck, IconKey } from './icons'
import { Button, Card, CardHead, Input, Pill } from './ui'

/**
 * Paste a 2FA secret, get the code. Deliberately stateless: the secret is sent
 * to the server, the code is computed, and nothing is written to disk. Saving it
 * against a profile is a separate, explicit action.
 */
export function TotpCard({ index, className = '' }: { index: number; className?: string }) {
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [period, setPeriod] = useState(30)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // The live secret and expiry, readable from the heartbeat without resubscribing.
  const secretRef = useRef('')
  const expiryRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    const generate = async () => {
      const value = secretRef.current.trim()
      if (!value) return
      try {
        const r = await api.otp(value)
        if (cancelled) return
        expiryRef.current = r.expiresAt
        setCode(r.code)
        setPeriod(r.period)
        setLeft(Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000)))
        setError('')
      } catch (err) {
        if (cancelled) return
        setCode('')
        expiryRef.current = 0
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    // All state updates happen in timer callbacks, never in the effect body.
    const timer = setInterval(() => {
      if (!expiryRef.current) return
      const ms = expiryRef.current - Date.now()
      setLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0) generate()
    }, 1000)

    // Regenerate shortly after typing stops.
    const debounce = setTimeout(generate, 350)

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(debounce)
    }
  }, [secret])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const fraction = period ? Math.min(1, left / period) : 0
  const urgent = left <= 5 && left > 0
  const ring = 2 * Math.PI * 15

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Lấy mã 2FA"
        sub="dán secret, nhận OTP — không lưu lại gì"
        right={code ? <Pill tone="ok">đang chạy</Pill> : undefined}
      />

      <Input
        className="mt-4 w-full font-mono text-[12.5px]"
        value={secret}
        placeholder="VD: JBSWY3DPEHPK3PXP hoặc otpauth://totp/…"
        autoComplete="off"
        spellCheck={false}
        aria-label="2FA secret"
        onChange={(e) => {
          secretRef.current = e.target.value
          setSecret(e.target.value)
        }}
      />

      {error && <p className="mt-3 text-[12.5px] text-bad">{error}</p>}

      {code && !error && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3.5">
          <IconKey className="size-[15px] shrink-0 text-accent" />

          <code
            className={`tnum font-mono text-[28px] leading-none tracking-[0.2em] transition-colors ${
              urgent ? 'text-warn' : 'text-fg'
            }`}
          >
            {code}
          </code>

          {/* Ring counting down the remaining seconds of this code. */}
          <span className="relative inline-flex size-8 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-line)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke={urgent ? 'var(--color-warn)' : 'var(--color-accent)'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - fraction)}
              />
            </svg>
            <span className="tnum relative text-[10.5px] text-faint">{left}</span>
          </span>

          <span className="grow" />

          <Button
            variant="pill"
            onClick={() =>
              navigator.clipboard?.writeText(code).then(
                () => setCopied(true),
                () => setCopied(false)
              )
            }
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
        </div>
      )}

      <p className="mt-auto pt-3.5 text-[11.5px] leading-relaxed text-faint text-pretty">
        Mã sinh ở server và tự đổi mỗi {period}s. Secret không được ghi ra đĩa — muốn giữ lâu dài thì
        lưu vào profile qua <b className="font-medium text-dim">⋯ → Cấu hình</b>.
      </p>
    </Card>
  )
}
