'use client'

import { useMemo, useState } from 'react'
import { Area, Donut, SegmentBar, type Segment } from './charts'
import {
  IconAlert,
  IconArchive,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconFile,
  IconMinus,
  IconPlus,
  IconSearch
} from './icons'
import {
  Avatar,
  Button,
  Card,
  CardHead,
  Chip,
  Pill,
  SearchInput,
  Segmented,
  avatarTone,
  formatDate,
  formatRemaining,
  formatTime,
  initials
} from './ui'
import { enabledFileItems } from '@/lib/items'
import type { BackupEntry, ProfileView } from '@/types'

// ── Live account ──────────────────────────────────────────────────

export function LiveCard({
  live,
  now,
  busy,
  onRecapture,
  onConfigure,
  onSave
}: {
  live: ProfileView | null
  now: number
  busy: boolean
  onRecapture: () => void
  onConfigure: () => void
  onSave: () => void
}) {
  if (!live) {
    return (
      <Card className="p-5" index={0}>
        <CardHead title="Account đang dùng" sub="không khớp profile nào" />
        <p className="mt-4 text-[13px] leading-relaxed text-dim text-pretty">
          Config trên đĩa không giống bất kỳ profile nào đã lưu — thường vì bạn vừa đăng nhập account
          mới, hoặc token vừa được refresh.
        </p>
        <Button variant="primary" className="mt-4" onClick={onSave}>
          Lưu thành profile
        </Button>
      </Card>
    )
  }

  const remaining = formatRemaining(live.identity?.expiresAt, now)
  const files = enabledFileItems(live.items)

  return (
    <Card className="overflow-hidden p-5" live index={0}>
      <CardHead
        title="Account đang dùng"
        sub={live.presetId}
        right={
          <Pill tone="ok">
            <span className="pulse-dot size-[6px] rounded-full bg-accent" aria-hidden />
            live
          </Pill>
        }
      />

      <div className="mt-4 flex items-center gap-3.5">
        <Avatar name={live.name} size={46} />
        <div className="min-w-0">
          <div className="truncate text-[26px] leading-tight font-semibold tracking-[-0.03em]">
            {live.name}
          </div>
          <div className="truncate font-mono text-[12.5px] text-dim">
            {live.identity?.label ?? '—'}
          </div>
        </div>
      </div>

      {/* Gradient plate standing in for the reference's hero illustration. */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/18 via-accent/6 to-transparent p-4">
        <div className="pointer-events-none absolute -top-8 -right-6 size-32 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.1em] text-accent/90 uppercase">token</div>
            <div
              className={`tnum mt-1 text-[22px] font-semibold tracking-[-0.02em] ${
                remaining.expired ? 'text-warn' : ''
              }`}
            >
              {remaining.text}
            </div>
            <div className="mt-0.5 text-[11px] text-faint">
              {live.identity?.expiresAt ? formatDate(live.identity.expiresAt) : 'không có hạn'}
            </div>
          </div>
          {live.identity?.plan && <Chip tone="ok">{live.identity.plan}</Chip>}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-[12px]">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <IconFile className="size-[14px] shrink-0 text-faint" />
            <dt className="min-w-0 grow truncate font-mono text-faint" title={f.targetPath}>
              {f.targetPath}
            </dt>
            <dd className="shrink-0">
              {f.matchesDisk ? (
                <IconCheck className="size-[14px] text-accent" />
              ) : (
                <IconAlert className="size-[14px] text-warn" />
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onRecapture} disabled={busy}>
          Cập nhật snapshot
        </Button>
        <Button variant="ghost" onClick={onConfigure} disabled={busy}>
          Cấu hình
        </Button>
      </div>
    </Card>
  )
}

// ── Counts + avatar cluster ───────────────────────────────────────

export function StatsCard({
  profiles,
  backups,
  onAdd,
  onRemoveLast,
  index
}: {
  profiles: ProfileView[]
  backups: BackupEntry[]
  onAdd: () => void
  onRemoveLast: () => void
  index: number
}) {
  const ready = profiles.filter((p) => {
    const files = enabledFileItems(p.items)
    return files.length > 0 && files.every((f) => f.hasContent)
  }).length
  const pct = profiles.length ? Math.round((ready / profiles.length) * 100) : 0

  return (
    <Card className="p-5" index={index}>
      <CardHead
        title="Accounts đã lưu"
        sub="sẵn sàng để switch"
        right={<Chip tone={pct === 100 ? 'ok' : 'warn'}>{pct}%</Chip>}
      />

      <div className="mt-4 flex items-baseline gap-2">
        <span className="tnum text-[38px] leading-none font-semibold tracking-[-0.035em]">
          {profiles.length}
        </span>
        <span className="text-[12.5px] text-faint">profile</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-sunken px-3.5 py-3">
          <div className="tnum text-[19px] font-semibold">{ready}</div>
          <div className="mt-0.5 text-[11px] text-faint">đủ snapshot</div>
        </div>
        <div className="rounded-xl border border-line bg-sunken px-3.5 py-3">
          <div className="tnum text-[19px] font-semibold">{backups.length}</div>
          <div className="mt-0.5 text-[11px] text-faint">lần switch</div>
        </div>
      </div>

      {/* Overlapping avatar cluster with the reference's +/− pair. */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center">
          {profiles.slice(0, 5).map((p, i) => (
            <span
              key={p.id}
              title={p.name}
              style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}
              className={`inline-flex size-8 items-center justify-center rounded-[10px] border-2 border-card text-[11px] font-semibold ${avatarTone(p.name)}`}
            >
              {initials(p.name)}
            </span>
          ))}
          {profiles.length > 5 && (
            <span className="tnum ml-2 text-[11.5px] text-faint">+{profiles.length - 5}</span>
          )}
          {profiles.length === 0 && <span className="text-[12px] text-faint">chưa có account</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onAdd}
            aria-label="Lưu account đang đăng nhập"
            title="Lưu account đang đăng nhập"
            className="cursor-pointer rounded-full border border-line bg-raised p-1.5 text-dim transition-colors hover:border-accent/50 hover:text-accent"
          >
            <IconPlus className="size-[14px]" />
          </button>
          <button
            onClick={onRemoveLast}
            disabled={!profiles.length}
            aria-label="Xoá profile mới nhất"
            title="Xoá profile mới nhất"
            className="cursor-pointer rounded-full border border-line bg-raised p-1.5 text-dim transition-colors hover:border-bad/50 hover:text-bad disabled:pointer-events-none disabled:opacity-35"
          >
            <IconMinus className="size-[14px]" />
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Token gauge + switch history ──────────────────────────────────

export function TokenCard({
  live,
  backups,
  now,
  index
}: {
  live: ProfileView | null
  backups: BackupEntry[]
  now: number
  index: number
}) {
  // Fraction of a 24h window still left on the token — the only honest
  // denominator available, since issue time is not in the payload.
  const fraction = useMemo(() => {
    const iso = live?.identity?.expiresAt
    if (!iso) return 0
    const ms = new Date(iso).getTime() - now
    return Math.max(0, Math.min(1, ms / 86_400_000))
  }, [live, now])

  // Switches per day over the last 14 days.
  const series = useMemo(() => {
    const days = 14
    const buckets = new Array(days).fill(0)
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    for (const b of backups) {
      const day = new Date(b.timestamp)
      day.setHours(0, 0, 0, 0)
      const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000)
      if (diff >= 0 && diff < days) buckets[days - 1 - diff] += 1
    }
    return buckets
  }, [backups, now])

  const remaining = formatRemaining(live?.identity?.expiresAt, now)
  const last = backups[0]

  return (
    <Card className="p-5" index={index}>
      <CardHead
        title="Token & lịch sử"
        sub="switch 14 ngày gần đây"
        right={
          live?.identity?.expiresAt ? (
            <Chip tone={fraction > 0.25 ? 'ok' : 'warn'}>{Math.round(fraction * 100)}%</Chip>
          ) : undefined
        }
      />

      <div className="mt-4 flex items-center gap-4">
        <Donut
          value={fraction}
          size={116}
          label={live?.identity?.expiresAt ? `${Math.round(fraction * 100)}%` : '—'}
          sub="còn lại"
        />
        <div className="min-w-0 space-y-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <IconClock className="size-[14px] shrink-0 text-accent" />
            <span className="truncate text-dim">{remaining.text}</span>
          </div>
          <div className="flex items-center gap-2">
            <IconArchive className="size-[14px] shrink-0 text-info" />
            <span className="truncate text-dim">
              {last ? `${last.profileName} · ${formatTime(last.timestamp)}` : 'chưa switch lần nào'}
            </span>
          </div>
        </div>
      </div>

      {/* An all-zero chart is a void, not information — say so instead. */}
      {backups.length === 0 ? (
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-faint">
          Chưa có lần switch nào để vẽ biểu đồ.
        </p>
      ) : (
        <div className="mt-4 border-t border-line pt-3">
          <Area points={series} />
          <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
            <span>14 ngày trước</span>
            <span>hôm nay</span>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── File capture breakdown ────────────────────────────────────────

export function FilesCard({ profiles, index }: { profiles: ProfileView[]; index: number }) {
  const segments: Segment[] = useMemo(() => {
    let match = 0
    let drift = 0
    let uncaptured = 0
    let missing = 0
    for (const p of profiles) {
      for (const f of enabledFileItems(p.items)) {
        if (!f.hasContent) uncaptured += 1
        else if (f.matchesDisk) match += 1
        else if (!f.targetExists) missing += 1
        else drift += 1
      }
    }
    return [
      { label: 'Khớp đĩa', value: match, color: 'var(--color-accent)' },
      { label: 'Khác đĩa', value: drift, color: 'var(--color-info)' },
      { label: 'Chưa capture', value: uncaptured, color: 'var(--color-warn)' },
      { label: 'Chưa có file', value: missing, color: 'var(--color-bad)' }
    ]
  }, [profiles])

  const total = segments.reduce((s, x) => s + x.value, 0)

  return (
    <Card className="p-5" index={index}>
      <CardHead
        title="File được quản lý"
        sub="trạng thái so với đĩa"
        right={<Chip>{total}</Chip>}
      />
      <div className="mt-5">
        <SegmentBar segments={segments} />
      </div>
    </Card>
  )
}

// ── Accounts table ────────────────────────────────────────────────

type Tab = 'all' | 'live' | 'blocked'

export function AccountsCard({
  profiles,
  busy,
  onSwitch,
  onConfigure,
  index,
  className = ''
}: {
  profiles: ProfileView[]
  busy: boolean
  onSwitch: (id: string) => void
  onConfigure: (id: string) => void
  index: number
  className?: string
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')

  const blockedOf = (p: ProfileView) => {
    const files = enabledFileItems(p.items)
    return files.length === 0 || files.some((f) => !f.hasContent)
  }

  const rows = profiles
    .filter((p) => (tab === 'live' ? p.active : tab === 'blocked' ? blockedOf(p) : true))
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.identity?.label ?? '').toLowerCase().includes(q)
      )
    })

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead title="Accounts" sub="bấm để đổi sang account khác" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'all', label: 'Tất cả', count: profiles.length },
            { id: 'live', label: 'Đang dùng', count: profiles.filter((p) => p.active).length },
            { id: 'blocked', label: 'Chưa capture', count: profiles.filter(blockedOf).length }
          ]}
        />
        <SearchInput
          className="min-w-[180px] grow"
          icon={<IconSearch className="size-[14px]" />}
          placeholder="Tìm account…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="text-[10.5px] tracking-[0.1em] text-faint uppercase">
              <th className="pb-2 font-medium">account</th>
              <th className="pb-2 font-medium">plan</th>
              <th className="pb-2 font-medium">file</th>
              <th className="pb-2 text-right font-medium">trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[13px] text-faint">
                  Không có account nào khớp.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const blocked = blockedOf(p)
              const files = enabledFileItems(p.items)
              return (
                <tr
                  key={p.id}
                  className="group border-t border-line/70 transition-colors hover:bg-raised/40"
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name} size={30} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium">{p.name}</span>
                          {p.active && (
                            <span
                              className="pulse-dot size-[6px] shrink-0 rounded-full bg-accent"
                              aria-hidden
                            />
                          )}
                        </div>
                        <div className="truncate font-mono text-[11px] text-faint">
                          {p.identity?.label ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-[12px] text-dim">{p.identity?.plan ?? '—'}</td>
                  <td className="py-3 pr-3">
                    <span className="tnum text-[12px] text-dim">{files.length}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      {p.active ? (
                        <Pill tone="ok">đang dùng</Pill>
                      ) : blocked ? (
                        <Pill tone="warn">chưa capture</Pill>
                      ) : (
                        <button
                          onClick={() => onSwitch(p.id)}
                          disabled={busy}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line2/70 bg-raised px-2.5 py-[3px] text-[11px] font-medium text-dim transition-all duration-200 hover:border-accent/50 hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                        >
                          đổi sang
                          <IconArrowRight className="size-[12px]" />
                        </button>
                      )}
                      <button
                        onClick={() => onConfigure(p.id)}
                        aria-label={`Cấu hình ${p.name}`}
                        className="cursor-pointer rounded-md p-1 text-faint opacity-0 transition-all group-hover:opacity-100 hover:bg-raised hover:text-fg focus-visible:opacity-100"
                      >
                        <IconFile className="size-[14px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Backup history ────────────────────────────────────────────────

export function BackupsCard({
  backups,
  index,
  className = ''
}: {
  backups: BackupEntry[]
  index: number
  className?: string
}) {
  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Backups"
        sub="mỗi lần switch tạo một bản"
        right={<Chip>{backups.length}</Chip>}
      />

      {backups.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">
          Chưa có lần switch nào.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line/70">
          {backups.slice(0, 12).map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <IconArchive className="size-[15px] shrink-0 text-faint" />
              <span className="min-w-0 grow truncate text-[13px]">{b.profileName}</span>
              <span className="tnum shrink-0 text-[11.5px] text-faint">
                {b.fileCount} file · {formatDate(b.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
