'use client'

import { useMemo, useState } from 'react'
import { IconArrowRight, IconClock, IconKey } from './icons'
import { Card, CardHead, Chip, Segmented, formatDate } from './ui'
import type { BackupEntry, ProfileView, UsagePoint } from '@/types'

type Kind = 'switch' | 'quota' | 'profile'

interface Event {
  id: string
  t: number
  kind: Kind
  title: string
  detail: string
}

const ICONS: Record<Kind, (p: { className?: string }) => React.ReactElement> = {
  switch: IconArrowRight,
  quota: IconClock,
  profile: IconKey
}

const TONES: Record<Kind, string> = {
  switch: 'text-accent',
  quota: 'text-warn',
  profile: 'text-info'
}

type Filter = 'all' | Kind

/**
 * One timeline from everything the app already records: switches (each writes a
 * backup), quota movements (from the locally accumulated series) and profiles
 * being created.
 */
export function HistoryCard({
  profiles,
  backups,
  history,
  index,
  className = ''
}: {
  profiles: ProfileView[]
  backups: BackupEntry[]
  history: Record<string, UsagePoint[]>
  index: number
  className?: string
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const events = useMemo(() => {
    const out: Event[] = []

    for (const b of backups) {
      out.push({
        id: `switch-${b.id}`,
        t: new Date(b.timestamp).getTime(),
        kind: 'switch',
        title: `Switch sang ${b.profileName}`,
        detail: `${b.fileCount} file được backup trước khi ghi`
      })
    }

    for (const p of profiles) {
      out.push({
        id: `profile-${p.id}`,
        t: new Date(p.createdAt).getTime(),
        kind: 'profile',
        title: `Lưu profile ${p.name}`,
        detail: p.identity?.label ?? '—'
      })

      // Only movements are interesting; a flat series would bury everything else.
      const key = p.identity?.accountKey
      const points = key ? (history[key] ?? []) : []
      for (let i = 1; i < points.length; i++) {
        const delta = points[i].used - points[i - 1].used
        if (Math.abs(delta) < 1) continue
        out.push({
          id: `quota-${p.id}-${points[i].t}`,
          t: points[i].t,
          kind: 'quota',
          title: `${p.name}: quota ${delta > 0 ? 'tăng' : 'giảm'} ${Math.abs(Math.round(delta))}%`,
          detail: `đã dùng ${Math.round(points[i].used)}%`
        })
      }
    }

    return out.sort((a, b) => b.t - a.t)
  }, [profiles, backups, history])

  const shown = events.filter((e) => filter === 'all' || e.kind === filter).slice(0, 60)

  const count = (k: Kind) => events.filter((e) => e.kind === k).length

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Lịch sử"
        sub="switch, biến động quota và profile mới"
        right={<Chip>{events.length}</Chip>}
      />

      <div className="mt-4">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'Tất cả', count: events.length },
            { id: 'switch', label: 'Switch', count: count('switch') },
            { id: 'quota', label: 'Quota', count: count('quota') },
            { id: 'profile', label: 'Profile', count: count('profile') }
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 grow rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint">
          Chưa có gì được ghi lại.
        </p>
      ) : (
        <ol className="mt-4 grow overflow-y-auto" style={{ maxHeight: 340 }}>
          {shown.map((e) => {
            const Icon = ICONS[e.kind]
            return (
              <li key={e.id} className="flex gap-3 border-b border-line/60 py-2.5 last:border-0">
                <span className={`mt-0.5 shrink-0 ${TONES[e.kind]}`}>
                  <Icon className="size-[14px]" />
                </span>
                <div className="min-w-0 grow">
                  <div className="truncate text-[12.5px]">{e.title}</div>
                  <div className="truncate text-[11px] text-faint">{e.detail}</div>
                </div>
                <span className="tnum shrink-0 text-[11px] text-faint">
                  {formatDate(new Date(e.t).toISOString())}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
