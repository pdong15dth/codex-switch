'use client'

import { useState } from 'react'
import { LineChart, type Series } from './LineChart'
import { Card, CardHead, Chip, Segmented } from './ui'
import type { ProfileView, UsagePoint } from '@/types'

const RANGES = [
  { id: '1h', label: '1 giờ', ms: 3_600_000 },
  { id: '24h', label: '24 giờ', ms: 86_400_000 },
  { id: '7d', label: '7 ngày', ms: 604_800_000 }
] as const

type RangeId = (typeof RANGES)[number]['id']

/** One colour per account, stable across renders. */
const COLOURS = [
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-warn)',
  'var(--color-lime)',
  'var(--color-bad)'
]

/**
 * Quota consumed over time. The series is accumulated by this app on every quota
 * refresh — the backend has no history endpoint, it only reports the current
 * figure — so the line starts the first time the dashboard reads quota.
 */
export function UsageChartCard({
  profiles,
  history,
  index,
  className = ''
}: {
  profiles: ProfileView[]
  history: Record<string, UsagePoint[]>
  index: number
  className?: string
}) {
  const [range, setRange] = useState<RangeId>('24h')
  const span = RANGES.find((r) => r.id === range)?.ms ?? 86_400_000

  const series: Series[] = profiles
    .map((p, i) => {
      const key = p.identity?.accountKey
      const points = key ? (history[key] ?? []) : []
      return {
        key: p.id,
        label: p.name,
        colour: COLOURS[i % COLOURS.length],
        points
      }
    })
    .filter((s) => s.points.length > 0)

  const total = series.reduce((n, s) => n + s.points.length, 0)

  const failures = profiles
    .filter((p) => p.usageError)
    .map((p) => ({ id: p.id, name: p.name, message: p.usageError!.message }))

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Quota đã dùng theo thời gian"
        sub="mỗi lần đọc quota là một điểm"
        right={<Chip>{total} điểm</Chip>}
      />

      <div className="mt-4">
        <Segmented<RangeId>
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
        />
      </div>

      {/* An empty chart should say why, not just sit there blank. */}
      {series.length === 0 && failures.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {failures.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-bad/35 bg-bad/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad text-pretty"
            >
              <b className="font-semibold">{f.name}</b>: {f.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grow">
        <LineChart series={series} spanMs={span} />
      </div>

      {series.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
          {series.map((s) => {
            const last = s.points[s.points.length - 1]
            return (
              <li key={s.key} className="flex items-center gap-2 text-[11.5px]">
                <span
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{ background: s.colour }}
                />
                <span className="max-w-[160px] truncate text-dim">{s.label}</span>
                <span className="tnum font-medium">đã dùng {Math.round(last.used)}%</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
