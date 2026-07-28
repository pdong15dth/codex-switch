'use client'

/** Hand-rolled SVG charts — no chart library, so nothing to keep in sync. */

/** Donut gauge. `value` is 0..1. */
export function Donut({
  value,
  size = 132,
  label,
  sub
}: {
  value: number
  size?: number
  label: string
  sub?: string
}) {
  const stroke = 11
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="donutStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-lime)" />
          </linearGradient>
        </defs>
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
          stroke="url(#donutStroke)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-spring)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-[19px] font-semibold tracking-[-0.02em]">{label}</span>
        {sub && <span className="mt-0.5 text-[10.5px] text-faint">{sub}</span>}
      </div>
    </div>
  )
}

/**
 * Area chart with the reference's green→lime gradient. Takes raw counts and
 * renders a smooth-ish polyline; flat input still produces a readable baseline.
 */
export function Area({ points, height = 82 }: { points: number[]; height?: number }) {
  const w = 300
  const max = Math.max(1, ...points)
  const step = points.length > 1 ? w / (points.length - 1) : w

  const coords = points.map((p, i) => {
    const x = i * step
    const y = height - 6 - (p / max) * (height - 16)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const line = `M ${coords.join(' L ')}`
  const fill = `${line} L ${w},${height} L 0,${height} Z`

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="areaStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--color-lime)" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#areaFill)" />
      <path
        d={line}
        fill="none"
        stroke="url(#areaStroke)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export interface Segment {
  label: string
  value: number
  color: string
}

/** Multi-segment bar plus legend, as in the reference's spending limits card. */
export function SegmentBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div>
      <div className="flex h-2.5 gap-1 overflow-hidden">
        {total === 0 ? (
          <div className="grow rounded-full bg-line" />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                title={`${s.label}: ${s.value}`}
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                className="rounded-full transition-[width] duration-500 ease-[var(--ease-spring)]"
              />
            ))
        )}
      </div>

      <ul className="mt-3.5 grid grid-cols-2 gap-y-2 text-[11.5px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: s.value ? s.color : 'var(--color-line2)' }}
            />
            <span className="truncate text-dim">{s.label}</span>
            <span className="tnum ml-auto pr-3 text-faint">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
