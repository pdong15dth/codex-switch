'use client'

import { useState } from 'react'
import { IconArchive, IconArrowRight, IconPlus, IconRefresh, IconSearch } from './icons'
import {
  Avatar,
  Button,
  Card,
  CardHead,
  Chip,
  Pill,
  SearchInput,
  Segmented,
  formatDate,
  tokenState
} from './ui'
import { enabledFileItems } from '@/lib/items'
import type { BackupEntry, ProfileView } from '@/types'

/** What a row can be, in the order the UI cares about. */
type RowState = 'live' | 'ready' | 'expired' | 'uncaptured'

function rowState(profile: ProfileView, now: number): RowState {
  const files = enabledFileItems(profile.items)
  if (files.length === 0 || files.some((f) => !f.hasContent)) return 'uncaptured'
  if (profile.active) return 'live'
  return tokenState(profile.identity, now).expired ? 'expired' : 'ready'
}

// ── Summary strip ─────────────────────────────────────────────────

/**
 * A thin line of only the facts worth knowing at a glance. Deliberately not a
 * card: the accounts table is the page, and this is a caption for it.
 */
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
  const liveToken = tokenState(live?.identity ?? null, now)
  const needsAttention = profiles.filter((p) => {
    const s = rowState(p, now)
    return s === 'uncaptured' || s === 'expired'
  }).length

  return (
    <div className="rise mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[26px] leading-none font-semibold tracking-[-0.03em]">
          {profiles.length}
        </span>
        <span className="text-[13px] text-dim">account đã lưu</span>
      </div>

      <span className="h-6 w-px bg-line" aria-hidden />

      {live ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="pulse-dot size-[7px] shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="truncate text-[13px]">
            đang dùng <b className="font-semibold">{live.name}</b>
          </span>
          {liveToken.fraction !== null && (
            <Chip tone={liveToken.tone}>
              {Math.round(liveToken.fraction * 100)}% · {liveToken.text}
            </Chip>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="size-[7px] shrink-0 rounded-full bg-faint" aria-hidden />
          <span className="text-[13px] text-dim">config trên đĩa không khớp profile nào</span>
        </div>
      )}

      {needsAttention > 0 && (
        <>
          <span className="h-6 w-px bg-line" aria-hidden />
          <Pill tone="warn">{needsAttention} account cần xử lý</Pill>
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

// ── Accounts table ────────────────────────────────────────────────

/** Per-account token bar: share of the token's own lifetime still left. */
function TokenCell({ profile, now }: { profile: ProfileView; now: number }) {
  const t = tokenState(profile.identity, now)
  if (t.fraction === null) return <span className="text-[12px] text-faint">{t.text}</span>

  const colour =
    t.tone === 'ok'
      ? 'var(--color-accent)'
      : t.tone === 'warn'
        ? 'var(--color-warn)'
        : 'var(--color-bad)'

  return (
    <div className="min-w-[110px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tnum text-[12.5px] font-medium" style={{ color: colour }}>
          {Math.round(t.fraction * 100)}%
        </span>
        <span className="tnum text-[11px] text-faint">{t.text}</span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-spring)]"
          style={{ width: `${Math.max(3, t.fraction * 100)}%`, background: colour }}
        />
      </div>
    </div>
  )
}

const STATE_PILL: Record<RowState, { tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  live: { tone: 'ok', label: 'đang dùng' },
  ready: { tone: 'neutral', label: 'sẵn sàng' },
  expired: { tone: 'warn', label: 'token hết hạn' },
  uncaptured: { tone: 'bad', label: 'chưa capture' }
}

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

  const attention = (p: ProfileView) => ['uncaptured', 'expired'].includes(rowState(p, now))

  const rows = profiles
    .filter((p) => (tab === 'ready' ? !attention(p) : tab === 'attention' ? attention(p) : true))
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) || (p.identity?.label ?? '').toLowerCase().includes(q)
      )
    })

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead title="Accounts" sub="bấm đổi sang để switch account đang dùng" />

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
        <table className="w-full min-w-[660px] border-collapse text-left">
          <thead>
            <tr className="text-[10.5px] tracking-[0.1em] text-faint uppercase">
              <th className="pb-2 font-medium">account</th>
              <th className="pb-2 font-medium">plan</th>
              <th className="pb-2 font-medium">token</th>
              <th className="pb-2 font-medium">trạng thái</th>
              <th className="pb-2 text-right font-medium">hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[13px] text-faint">
                  Không có account nào khớp.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const state = rowState(p, now)
              const pill = STATE_PILL[state]
              return (
                <tr
                  key={p.id}
                  className={`group border-t border-line/70 transition-colors ${
                    state === 'live' ? 'bg-accent/4' : 'hover:bg-raised/40'
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.name} size={32} />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                        <div
                          className="truncate font-mono text-[11px] text-faint"
                          title={p.identity?.label ?? undefined}
                        >
                          {p.identity?.label ?? '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-[12.5px] text-dim">{p.identity?.plan ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <TokenCell profile={p} now={now} />
                  </td>
                  <td className="py-3 pr-4">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {state === 'live' ? (
                        <Button
                          variant="pill"
                          onClick={() => onRecapture(p.id)}
                          disabled={busy}
                          title="Chụp lại credential hiện tại (dùng sau khi token được refresh)"
                        >
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
                        title="Cấu hình"
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
