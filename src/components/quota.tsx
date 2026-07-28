'use client'

import { IconClock } from './icons'
import { windowLabel } from '@/lib/usage'
import type { UsageWindow } from '@/types'

/** "6 ngày 4h" / "42m" — derived from `reset_at`, not from the window length. */
export function untilReset(resetAt: string | null, now: number): string | null {
  if (!resetAt) return null
  const ms = new Date(resetAt).getTime() - now
  if (ms <= 0) return 'đã reset'
  const mins = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days} ngày ${hours % 24}h`
  if (hours >= 1) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

export function quotaColour(usedPercent: number): string {
  if (usedPercent >= 90) return 'var(--color-bad)'
  if (usedPercent >= 65) return 'var(--color-warn)'
  return 'var(--color-accent)'
}

/**
 * Ring showing how much quota is left. The backend reports `used_percent`, so
 * the arc is drawn from `100 - used`: the ring empties as the quota is spent.
 */
export function QuotaGauge({ window: w, size = 148 }: { window: UsageWindow; size?: number }) {
  const used = Math.max(0, Math.min(100, w.usedPercent))
  const left = 100 - used
  const colour = quotaColour(used)

  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - left / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-spring)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tnum text-[28px] leading-none font-semibold tracking-[-0.03em]"
          style={{ color: colour }}
        >
          {Math.round(left)}%
        </span>
        <span className="mt-1 text-[11px] text-faint">còn lại</span>
      </div>
    </div>
  )
}

/** Compact bar + labels: used on the left, remaining as the headline. */
export function QuotaBar({
  window: w,
  now,
  showReset = true
}: {
  window: UsageWindow
  now: number
  showReset?: boolean
}) {
  const used = Math.max(0, Math.min(100, w.usedPercent))
  const colour = quotaColour(used)
  const reset = untilReset(w.resetAt, now)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] tracking-[0.06em] text-faint uppercase">
          quota {windowLabel(w.windowSeconds)}
        </span>
        <span className="tnum text-[11.5px] text-faint">đã dùng {Math.round(used)}%</span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="tnum text-[19px] leading-none font-semibold tracking-[-0.02em]"
          style={{ color: colour }}
        >
          {Math.round(100 - used)}%
        </span>
        <span className="text-[11.5px] text-dim">còn lại</span>
      </div>

      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-spring)]"
          style={{ width: `${Math.max(2, used)}%`, background: colour }}
        />
      </div>

      {showReset && reset && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
          <IconClock className="size-[11px] shrink-0" />
          reset sau {reset}
        </div>
      )}
    </div>
  )
}
