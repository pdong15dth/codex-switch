'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import { IconCheck, IconKey } from './icons'
import { Button } from './ui'

/**
 * Shows the account's current 2FA code with a countdown, refetching when the
 * window rolls over. The shared secret is never sent here — the server returns
 * only the digits and their expiry.
 */
export function TotpCode({ profileId, name }: { profileId: string; name: string }) {
  const [code, setCode] = useState('')
  const [period, setPeriod] = useState(30)
  /** Seconds left, computed in the heartbeat so render stays pure. */
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  // Lets the heartbeat read the latest expiry without resubscribing.
  const expiryRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    const fetchCode = async () => {
      try {
        const r = await api.totpCode(profileId)
        if (cancelled) return
        expiryRef.current = r.expiresAt
        setCode(r.code)
        setPeriod(r.period)
        setLeft(Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000)))
        setError('')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    // Every setState below runs from a timer callback, never the effect body.
    const first = setTimeout(fetchCode, 0)
    const timer = setInterval(() => {
      const ms = expiryRef.current - Date.now()
      setLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (expiryRef.current && ms <= 0) fetchCode()
    }, 1000)

    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [profileId])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  if (error) return <p className="text-[12px] text-bad">{error}</p>

  const fraction = period ? Math.min(1, left / period) : 0
  const urgent = left <= 5
  const ring = 2 * Math.PI * 15

  return (
    <div className="flex items-center gap-2.5">
      <IconKey className="size-[14px] shrink-0 text-faint" />

      <code
        className={`tnum rounded-lg border px-2.5 py-1 font-mono text-[17px] tracking-[0.18em] transition-colors ${
          urgent ? 'border-warn/50 bg-warn/10 text-warn' : 'border-line2/70 bg-sunken text-fg'
        }`}
      >
        {code || '······'}
      </code>

      {/* Ring counting down the remaining seconds of this code. */}
      <span className="relative inline-flex size-7 shrink-0 items-center justify-center">
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
        <span className="tnum relative text-[10px] text-faint">{left}</span>
      </span>

      <Button
        variant="pill"
        onClick={() =>
          navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => setCopied(false)
          )
        }
        aria-label={`Copy mã 2FA của ${name}`}
      >
        {copied ? <IconCheck className="size-[13px] text-accent" /> : 'Copy'}
      </Button>
    </div>
  )
}
