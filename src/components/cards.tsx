'use client'

import { useState } from 'react'
import { IconArchive, IconArrowRight, IconClock, IconPlus, IconRefresh, IconSearch } from './icons'
import { QuotaBar, QuotaGauge, untilReset } from './quota'
import {
  Avatar,
  Button,
  Card,
  CardHead,
  Chip,
  Pill,
  SearchInput,
  Segmented,
  formatDate
} from './ui'
import { enabledFileItems } from '@/lib/items'
import { windowLabel } from '@/lib/usage'
import type { BackupEntry, ProfileView } from '@/types'

/** What a profile can be, in the order the UI cares about. */
type RowState = 'live' | 'ready' | 'uncaptured'

export function rowState(profile: ProfileView): RowState {
  const files = enabledFileItems(profile.items)
  if (files.length === 0 || files.some((f) => !f.hasContent)) return 'uncaptured'
  return profile.active ? 'live' : 'ready'
}

const STATE_PILL: Record<RowState, { tone: 'ok' | 'neutral' | 'bad'; label: string }> = {
  live: { tone: 'ok', label: 'đang dùng' },
  ready: { tone: 'neutral', label: 'sẵn sàng' },
  uncaptured: { tone: 'bad', label: 'chưa capture' }
}

/** The quota window to headline for a profile: primary, else secondary. */
const mainWindow = (p: ProfileView) => p.usage?.primary ?? p.usage?.secondary ?? null

// ── Summary strip ─────────────────────────────────────────────────

export function SummaryBar({
  profiles,
  now,
  onAdd,
  adding
}: {
  profiles: ProfileView[]
  now: number
  onAdd: () => void
  adding: boolean
}) {
  const live = profiles.find((p) => p.active) ?? null
  const w = live ? mainWindow(live) : null
  const attention = profiles.filter((p) => rowState(p) === 'uncaptured').length

  return (
    <div className="rise mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[24px] leading-none font-semibold tracking-[-0.03em]">
          {profiles.length}
        </span>
        <span className="text-[13px] text-dim">account</span>
      </div>

      <span className="h-6 w-px bg-line" aria-hidden />

      {live ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="pulse-dot size-[7px] shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="truncate text-[13px]">
            đang dùng <b className="font-semibold">{live.name}</b>
          </span>
          {w && <Chip tone="ok">còn {Math.round(100 - w.usedPercent)}%</Chip>}
          {w?.resetAt && (
            <span className="text-[12px] text-faint">reset sau {untilReset(w.resetAt, now)}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="size-[7px] shrink-0 rounded-full bg-faint" aria-hidden />
          <span className="text-[13px] text-dim">config trên đĩa không khớp profile nào</span>
        </div>
      )}

      {attention > 0 && (
        <>
          <span className="h-6 w-px bg-line" aria-hidden />
          <Pill tone="bad">{attention} chưa capture</Pill>
        </>
      )}

      <span className="grow" />

      <Button variant="primary" onClick={onAdd} disabled={adding}>
        <IconPlus className="size-[14px]" />
        Thêm account
      </Button>
    </div>
  )
}

// ── Live account (hero) ───────────────────────────────────────────

export function LiveCard({
  live,
  now,
  busy,
  index,
  onRecapture,
  onConfigure,
  onAdd
}: {
  live: ProfileView | null
  now: number
  busy: boolean
  index: number
  onRecapture: () => void
  onConfigure: () => void
  onAdd: () => void
}) {
  if (!live) {
    return (
      <Card className="p-5" index={index}>
        <CardHead title="Account đang dùng" sub="không khớp profile nào" />
        <p className="mt-4 grow text-[13px] leading-relaxed text-dim text-pretty">
          Config trên đĩa không giống profile nào đã lưu — thường vì vừa đăng nhập account mới, hoặc
          token vừa được refresh.
        </p>
        <Button variant="primary" className="mt-auto" onClick={onAdd}>
          Thêm account
        </Button>
      </Card>
    )
  }

  const w = mainWindow(live)

  return (
    <Card className="p-5" live index={index}>
      <CardHead
        title="Account đang dùng"
        sub={live.usage ? `quota đọc lúc ${formatDate(live.usage.fetchedAt)}` : 'chưa đọc quota'}
        right={
          <Pill tone="ok">
            <span className="pulse-dot size-[6px] rounded-full bg-accent" aria-hidden />
            live
          </Pill>
        }
      />

      <div className="mt-4 flex items-center gap-3.5">
        <Avatar name={live.name} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[22px] leading-tight font-semibold tracking-[-0.025em]">
            {live.name}
          </div>
          <div className="truncate font-mono text-[12px] text-dim" title={live.identity?.label ?? ''}>
            {live.identity?.label ?? '—'}
          </div>
        </div>
        {live.identity?.plan && <Pill tone="ok">{live.identity.plan}</Pill>}
      </div>

      <div className="mt-5">
        {w ? (
          <QuotaBar window={w} now={now} />
        ) : (
          <p className="rounded-xl border border-line bg-raised/40 px-3.5 py-2.5 text-[12.5px] text-dim">
            Chưa đọc được quota — bấm <b className="font-medium text-fg">Làm mới</b>.
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button onClick={onRecapture} disabled={busy}>
          <IconRefresh className="size-[13px] shrink-0" />
          Cập nhật snapshot
        </Button>
        <Button variant="ghost" onClick={onConfigure} disabled={busy}>
          Cấu hình
        </Button>
      </div>
    </Card>
  )
}

// ── Quota gauge + reset ───────────────────────────────────────────

export function QuotaCard({
  live,
  now,
  index
}: {
  live: ProfileView | null
  now: number
  index: number
}) {
  const w = live ? mainWindow(live) : null
  const reset = w?.resetAt ? untilReset(w.resetAt, now) : null

  return (
    <Card className="p-5" index={index}>
      <CardHead
        title="Quota"
        sub={w ? `cửa sổ ${windowLabel(w.windowSeconds)}` : 'chưa có dữ liệu'}
        right={w ? <Chip tone="neutral">đã dùng {Math.round(w.usedPercent)}%</Chip> : undefined}
      />

      {live?.usageError && (
        <p className="mt-4 rounded-xl border border-bad/35 bg-bad/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad text-pretty">
          {live.usageError.message}
        </p>
      )}

      {w ? (
        <div className="mt-4 flex grow flex-col items-center justify-center gap-4">
          <QuotaGauge window={w} />
          <div className="w-full space-y-2 border-t border-line pt-3.5 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-faint">
                <IconClock className="size-[12px] shrink-0" />
                reset sau
              </span>
              <span className="tnum font-medium">{reset ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-faint">thời điểm reset</span>
              <span className="tnum text-dim">{w.resetAt ? formatDate(w.resetAt) : '—'}</span>
            </div>
            {live?.usage?.creditBalance !== null && live?.usage?.creditBalance !== undefined && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-faint">credits</span>
                <span className="tnum text-dim">{live.usage.creditBalance}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 grow rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint">
          Bấm <b className="font-medium text-dim">Làm mới</b> để đọc quota của account đang dùng.
        </p>
      )}
    </Card>
  )
}

// ── Other profiles + quick switch ─────────────────────────────────

export function SwitchCard({
  profiles,
  now,
  busy,
  index,
  className = '',
  onSwitch,
  onConfigure
}: {
  profiles: ProfileView[]
  now: number
  busy: boolean
  index: number
  className?: string
  onSwitch: (id: string) => void
  onConfigure: (id: string) => void
}) {
  const others = profiles.filter((p) => !p.active)

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Đổi nhanh"
        sub="các account khác và trạng thái của chúng"
        right={<Chip>{others.length}</Chip>}
      />

      {others.length === 0 ? (
        <p className="mt-4 grow rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint">
          Chưa có account nào khác. Bấm <b className="font-medium text-dim">Thêm account</b>.
        </p>
      ) : (
        <ul className="mt-4 grow space-y-2">
          {others.map((p) => {
            const state = rowState(p)
            const pill = STATE_PILL[state]
            const w = mainWindow(p)
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line/70 bg-raised/40 px-3.5 py-3 transition-colors hover:border-line2"
              >
                <Avatar name={p.name} size={32} />

                <div className="min-w-0 grow">
                  <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                  <div
                    className="truncate font-mono text-[11px] text-faint"
                    title={p.identity?.label ?? ''}
                  >
                    {p.identity?.label ?? '—'}
                  </div>
                </div>

                {w ? (
                  <div className="w-[86px] shrink-0">
                    <div className="tnum text-right text-[12px] font-medium">
                      còn {Math.round(100 - w.usedPercent)}%
                    </div>
                    <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.max(3, 100 - w.usedPercent)}%` }}
                      />
                    </div>
                    {w.resetAt && (
                      <div className="mt-1 text-right text-[10px] text-faint">
                        reset {untilReset(w.resetAt, now)}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="shrink-0 text-[11px] text-faint">chưa đọc quota</span>
                )}

                <Pill tone={pill.tone}>{pill.label}</Pill>

                {state === 'uncaptured' ? (
                  <Button variant="pill" onClick={() => onConfigure(p.id)}>
                    Cấu hình
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => onSwitch(p.id)} disabled={busy}>
                    Đổi sang
                    <IconArrowRight className="size-[13px] shrink-0" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Full table (list view) ────────────────────────────────────────

type Tab = 'all' | 'ready' | 'attention'

export function AccountsCard({
  profiles,
  now,
  busy,
  onSwitch,
  onRecapture,
  onConfigure,
  index,
  className = ''
}: {
  profiles: ProfileView[]
  now: number
  busy: boolean
  onSwitch: (id: string) => void
  onRecapture: (id: string) => void
  onConfigure: (id: string) => void
  index: number
  className?: string
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')

  const attention = (p: ProfileView) => rowState(p) === 'uncaptured'

  const rows = profiles
    .filter((p) => (tab === 'ready' ? !attention(p) : tab === 'attention' ? attention(p) : true))
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.identity?.label ?? '').toLowerCase().includes(q)
    })

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead title="Tất cả account" sub="quota, trạng thái và đổi nhanh" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'all', label: 'Tất cả', count: profiles.length },
            { id: 'ready', label: 'Sẵn sàng', count: profiles.filter((p) => !attention(p)).length },
            { id: 'attention', label: 'Cần xử lý', count: profiles.filter(attention).length }
          ]}
        />
        <SearchInput
          className="min-w-[180px] grow"
          icon={<IconSearch className="size-[14px]" />}
          placeholder="Tìm theo tên hoặc email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-4 grow overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="text-[10.5px] tracking-[0.1em] text-faint uppercase">
              <th className="pb-2 font-medium">account</th>
              <th className="pb-2 font-medium">plan</th>
              <th className="pb-2 font-medium">quota còn lại</th>
              <th className="pb-2 font-medium">reset sau</th>
              <th className="pb-2 font-medium">trạng thái</th>
              <th className="pb-2 text-right font-medium">hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px] text-faint">
                  Không có account nào khớp.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const state = rowState(p)
              const pill = STATE_PILL[state]
              const w = mainWindow(p)
              return (
                <tr
                  key={p.id}
                  className={`group border-t border-line/70 transition-colors ${
                    state === 'live' ? 'bg-accent/4' : 'hover:bg-raised/40'
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name} size={30} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[11px] text-faint">
                          {p.identity?.label ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-[12.5px] text-dim">{p.identity?.plan ?? '—'}</td>
                  <td className="tnum py-3 pr-4 text-[12.5px]">
                    {w ? `${Math.round(100 - w.usedPercent)}%` : '—'}
                  </td>
                  <td className="tnum py-3 pr-4 text-[12px] text-dim">
                    {w?.resetAt ? untilReset(w.resetAt, now) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {state === 'live' ? (
                        <Button variant="pill" onClick={() => onRecapture(p.id)} disabled={busy}>
                          <IconRefresh className="size-[13px]" />
                          Cập nhật
                        </Button>
                      ) : state === 'uncaptured' ? (
                        <Button variant="pill" onClick={() => onConfigure(p.id)}>
                          Cấu hình
                        </Button>
                      ) : (
                        <Button variant="pill" onClick={() => onSwitch(p.id)} disabled={busy}>
                          đổi sang
                          <IconArrowRight className="size-[13px]" />
                        </Button>
                      )}
                      <button
                        onClick={() => onConfigure(p.id)}
                        aria-label={`Cấu hình ${p.name}`}
                        className="cursor-pointer rounded-md px-1.5 py-1 text-[13px] text-faint opacity-0 transition-all group-hover:opacity-100 hover:bg-raised hover:text-fg focus-visible:opacity-100"
                      >
                        ⋯
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
        sub="mỗi lần switch tạo một bản trước khi ghi"
        right={<Chip>{backups.length}</Chip>}
      />

      {backups.length === 0 ? (
        <p className="mt-5 grow rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">
          Chưa có lần switch nào.
        </p>
      ) : (
        <ul className="mt-4 grow divide-y divide-line/70">
          {backups.slice(0, 20).map((b) => (
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
