'use client'

import { useRef, useState } from 'react'
import type { UsagePoint } from '@/types'

export interface Series {
  key: string
  label: string
  colour: string
  points: UsagePoint[]
}

const PAD = { top: 12, right: 10, bottom: 22, left: 30 }
const W = 640
const H = 190

/** Nice-ish time label for the x axis and the tooltip. */
function timeLabel(t: number, spanMs: number): string {
  const d = new Date(t)
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  if (spanMs > 86_400_000) {
    return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${hm}`
  }
  return hm
}

/**
 * Quota consumed over time, one line per account. Y is fixed to 0–100 because
 * the value is a percentage of the window, so the scale is meaningful on its own
 * and comparable between accounts.
 */
export function LineChart({ series, spanMs }: { series: Series[]; spanMs: number }) {
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const all = series.flatMap((s) => s.points)
  if (all.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-faint">
        Chưa có dữ liệu. App ghi một điểm mỗi lần đọc quota (5 phút/lần) — để mở một lúc là có
        đường.
      </p>
    )
  }

  const tMax = Math.max(...all.map((p) => p.t))
  const tMin = Math.min(tMax - spanMs, ...all.map((p) => p.t))
  const span = Math.max(1, tMax - tMin)

  const px = (t: number) => PAD.left + ((t - tMin) / span) * (W - PAD.left - PAD.right)
  const py = (used: number) => PAD.top + (1 - used / 100) * (H - PAD.top - PAD.bottom)

  const visible = series
    .map((s) => ({ ...s, points: s.points.filter((p) => p.t >= tMin) }))
    .filter((s) => s.points.length > 0)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const ratio = (e.clientX - box.left) / box.width
    const x = ratio * W
    if (x < PAD.left || x > W - PAD.right) return setHover(null)
    setHover({ x, t: tMin + ((x - PAD.left) / (W - PAD.left - PAD.right)) * span })
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.colour} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.colour} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal grid at every 25%. */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={py(v)}
              y2={py(v)}
              stroke="var(--color-line)"
              strokeWidth="1"
              strokeDasharray={v === 0 ? undefined : '3 4'}
            />
            <text
              x={PAD.left - 6}
              y={py(v) + 3.5}
              textAnchor="end"
              className="fill-[var(--color-faint)]"
              style={{ fontSize: 9 }}
            >
              {v}
            </text>
          </g>
        ))}

        {visible.map((s) => {
          const line = s.points.map((p) => `${px(p.t).toFixed(1)},${py(p.used).toFixed(1)}`)
          const d = `M ${line.join(' L ')}`
          const area = `${d} L ${px(s.points[s.points.length - 1].t).toFixed(1)},${py(0)} L ${px(s.points[0].t).toFixed(1)},${py(0)} Z`
          const last = s.points[s.points.length - 1]

          return (
            <g key={s.key}>
              <path d={area} fill={`url(#fill-${s.key})`} />
              <path
                d={d}
                fill="none"
                stroke={s.colour}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* A single reading would otherwise be invisible. */}
              {s.points.length === 1 && (
                <circle cx={px(last.t)} cy={py(last.used)} r="3" fill={s.colour} />
              )}
              <circle
                cx={px(last.t)}
                cy={py(last.used)}
                r="3"
                fill="var(--color-card)"
                stroke={s.colour}
                strokeWidth="2"
              />
            </g>
          )
        })}

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--color-line2)"
            strokeWidth="1"
          />
        )}

        <text
          x={PAD.left}
          y={H - 6}
          className="fill-[var(--color-faint)]"
          style={{ fontSize: 9 }}
        >
          {timeLabel(tMin, span)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="fill-[var(--color-faint)]"
          style={{ fontSize: 9 }}
        >
          {timeLabel(tMax, span)}
        </text>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line2/70 bg-card px-2.5 py-1.5 text-[11px] shadow-lg">
          <div className="tnum mb-1 text-faint">{timeLabel(hover.t, span)}</div>
          {visible.map((s) => {
            // Nearest reading to the cursor, per series.
            const near = s.points.reduce((best, p) =>
              Math.abs(p.t - hover.t) < Math.abs(best.t - hover.t) ? p : best
            )
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: s.colour }}
                />
                <span className="max-w-[120px] truncate text-dim">{s.label}</span>
                <span className="tnum ml-auto font-medium">{Math.round(near.used)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
