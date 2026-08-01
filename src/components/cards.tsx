'use client'

import { useState, type ReactNode } from 'react'
import {
  IconArchive,
  IconArrowRight,
  IconClock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTrash
} from './icons'
import { QuotaBar, QuotaGauge, quotaColour, readAge, untilReset } from './quota'
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
import { isDeadCredentialError, windowLabel } from '@/lib/usage'
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

/** Quota remaining for ranking; null when never read, so dataless accounts sort last. */
const quotaLeft = (p: ProfileView): number | null => {
  const w = mainWindow(p)
  return w ? 100 - w.usedPercent : null
}

/** Small ghost icon button for secondary actions next to the primary one. */
function IconAction({
  label,
  danger = false,
  className = '',
  onClick,
  children
}: {
  label: string
  danger?: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 transition-all duration-200 ease-[var(--ease-spring)] hover:bg-raised active:scale-[0.94] ${
        danger ? 'text-faint hover:text-bad' : 'text-faint hover:text-fg'
      } ${className}`}
    >
      {children}
    </button>
  )
}

// ── Summary strip ─────────────────────────────────────────────────

export function SummaryBar({ profiles, now }: { profiles: ProfileView[]; now: number }) {
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
    </div>
  )
}

// ── Live account (hero) ───────────────────────────────────────────

/**
 * The live account and everything known about its quota in one panel: gauge
 * for the main window, a bar for the second window when the provider sends
 * two, then reset/credit/token facts. Quota used to live in a separate card;
 * merging them removes a duplicated, often-empty panel.
 */
export function LiveCard({
  live,
  now,
  busy,
  index,
  className = '',
  onRecapture,
  onConfigure,
  onAdd
}: {
  live: ProfileView | null
  now: number
  busy: boolean
  index: number
  className?: string
  onRecapture: () => void
  onConfigure: () => void
  onAdd: () => void
}) {
  if (!live) {
    return (
      <Card className={`p-5 ${className}`} index={index}>
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

  const primary = live.usage?.primary ?? null
  const secondary = live.usage?.secondary ?? null
  const w = primary ?? secondary
  const both = primary !== null && secondary !== null
  const token = tokenState(live.identity, now)
  const tokenColour =
    token.tone === 'ok'
      ? 'text-accent'
      : token.tone === 'warn'
        ? 'text-warn'
        : token.tone === 'bad'
          ? 'text-bad'
          : 'text-dim'

  return (
    <Card className={`p-5 ${className}`} live index={index}>
      <CardHead
        title="Account đang dùng"
        sub={live.usage ? `quota ${readAge(live.usage.fetchedAt, now)}` : 'chưa đọc quota'}
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

      {live.usageError && (
        <p className="mt-4 rounded-xl border border-bad/35 bg-bad/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad text-pretty">
          {live.usageError.message}
        </p>
      )}

      {w ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-5">
          <div className="flex flex-col items-center gap-2">
            <QuotaGauge window={w} size={136} />
            <span className="text-[10.5px] tracking-[0.06em] text-faint uppercase">
              cửa sổ {windowLabel(w.windowSeconds)}
            </span>
          </div>

          <div className="min-w-[220px] grow">
            {both && secondary ? (
              <div className="mb-3.5 border-b border-line pb-3.5">
                <QuotaBar window={secondary} now={now} />
              </div>
            ) : null}

            <div className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-faint">
                  <IconClock className="size-[12px] shrink-0" />
                  reset sau
                </span>
                <span className="tnum font-medium">
                  {w.resetAt ? (untilReset(w.resetAt, now) ?? '—') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-faint">thời điểm reset</span>
                <span className="tnum text-dim">{w.resetAt ? formatDate(w.resetAt) : '—'}</span>
              </div>
              {live.usage?.creditBalance != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-faint">credits</span>
                  <span className="tnum text-dim">{live.usage.creditBalance}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-faint">token</span>
                <span className={`tnum ${tokenColour}`}>{token.text}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-raised/40 px-3.5 py-2.5 text-[12.5px] text-dim">
          Chưa đọc được quota — quota tự đọc khi mở trang, hoặc bấm{' '}
          <b className="font-medium text-fg">Làm mới</b>.
        </p>
      )}

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

// ── Best alternative (hero) ───────────────────────────────────────

/**
 * The account to switch to right now: ready, not live, most quota left. This
 * is the overview's main answer, so it sits beside the live card with the
 * switch button attached.
 */
export function BestPickCard({
  profiles,
  now,
  busy,
  index,
  className = '',
  onSwitch,
  onAdd,
  onConfigure,
  onRepair
}: {
  profiles: ProfileView[]
  now: number
  busy: boolean
  index: number
  className?: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onConfigure: (id: string) => void
  onRepair: (id: string) => void
}) {
  const live = profiles.find((p) => p.active) ?? null
  const others = profiles.filter((p) => !p.active)
  // Dead credentials can look "ready" (they have content) — exclude them, or
  // the card would recommend an account that fails the moment it is used.
  const best =
    [...others]
      .filter((p) => rowState(p) === 'ready' && !isDeadCredentialError(p.usageError))
      .sort((a, b) => (quotaLeft(b) ?? -1) - (quotaLeft(a) ?? -1))[0] ?? null
  const dead = others.filter((p) => isDeadCredentialError(p.usageError))

  const liveW = live ? mainWindow(live) : null
  const urgent = Boolean(live?.usage?.limitReached) || (liveW ? liveW.usedPercent >= 80 : false)

  const w = best ? mainWindow(best) : null
  const left = w ? Math.round(100 - w.usedPercent) : null
  const reset = w?.resetAt ? untilReset(w.resetAt, now) : null

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Nên đổi sang"
        sub="account dự phòng tốt nhất hiện tại"
        right={urgent ? <Pill tone="warn">quota sắp hết</Pill> : undefined}
      />

      {best ? (
        <>
          <div className="mt-4 flex items-center gap-3.5">
            <Avatar name={best.name} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[17px] leading-tight font-semibold tracking-[-0.02em]">
                {best.name}
              </div>
              <div
                className="truncate font-mono text-[11.5px] text-dim"
                title={best.identity?.label ?? ''}
              >
                {best.identity?.label ?? '—'}
              </div>
            </div>
            {best.identity?.plan && <Pill>{best.identity.plan}</Pill>}
          </div>

          {w && left !== null ? (
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="tnum text-[32px] leading-none font-semibold tracking-[-0.03em]"
                  style={{ color: quotaColour(w.usedPercent) }}
                >
                  {left}%
                </span>
                <span className="text-[12px] text-dim">quota còn lại</span>
              </div>
              <div className="mt-1.5 text-[11.5px] text-faint">
                {[
                  reset ? `reset sau ${reset}` : null,
                  best.usage ? readAge(best.usage.fetchedAt, now) : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] leading-relaxed text-dim">
              Chưa đọc được quota của account này — vẫn có thể đổi sang.
            </p>
          )}

          <Button
            variant="primary"
            className="mt-auto w-full justify-center"
            onClick={() => onSwitch(best.id)}
            disabled={busy}
          >
            Đổi sang {best.name}
            <IconArrowRight className="size-[13px] shrink-0" />
          </Button>
        </>
      ) : others.length === 0 ? (
        <>
          <p className="mt-4 grow text-[13px] leading-relaxed text-dim text-pretty">
            Mới có một account. Thêm account thứ hai để có dự phòng khi account chính hết quota.
          </p>
          <Button variant="primary" className="mt-auto" onClick={onAdd}>
            <IconPlus className="size-[13px] shrink-0" />
            Thêm account
          </Button>
        </>
      ) : dead.length > 0 ? (
        <>
          <p className="mt-4 grow text-[13px] leading-relaxed text-dim text-pretty">
            {dead.length === others.length
              ? 'Tất cả account còn lại đều bị thu hồi token — đăng nhập lại là dùng tiếp được, không cần tạo profile mới.'
              : `${dead.length} account bị thu hồi token — đăng nhập lại là dùng tiếp được.`}
          </p>
          <Button
            variant="primary"
            className="mt-auto"
            onClick={() => onRepair(dead[0].id)}
            disabled={busy}
          >
            <IconRefresh className="size-[13px] shrink-0" />
            Đăng nhập lại {dead[0].name}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-4 grow text-[13px] leading-relaxed text-dim text-pretty">
            Còn {others.length} account khác nhưng chưa capture credential — cấu hình xong mới đổi
            được.
          </p>
          <Button className="mt-auto" onClick={() => onConfigure(others[0].id)}>
            Cấu hình ngay
          </Button>
        </>
      )}
    </Card>
  )
}

// ── Account tile: one account as a mini-card ──────────────────────

/** Handlers every account tile can trigger. */
interface TileActions {
  busy: boolean
  onSwitch: (id: string) => void
  onConfigure: (id: string) => void
  onRepair: (id: string) => void
  onRecapture: (id: string) => void
  onDelete: (id: string, name: string) => void
}

/** One account as a mini-card: identity and plan, quota, then its actions. */
function AccountTile({
  p,
  now,
  busy,
  onSwitch,
  onConfigure,
  onRepair,
  onRecapture,
  onDelete
}: { p: ProfileView; now: number } & TileActions) {
  const state = rowState(p)
  const pill = STATE_PILL[state]
  const w = mainWindow(p)
  const left = w ? Math.round(100 - w.usedPercent) : null
  const stale = p.usage ? now - new Date(p.usage.fetchedAt).getTime() > 30 * 60_000 : false
  const dead = isDeadCredentialError(p.usageError)

  return (
    <li
      className={`flex flex-col rounded-xl border p-4 transition-colors ${
        state === 'live'
          ? 'border-accent/25 bg-accent/6'
          : 'border-line/70 bg-raised/40 hover:border-line2'
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={34} />
        <div className="min-w-0 grow">
          <div className="truncate text-[13.5px] font-medium">{p.name}</div>
          <div
            className="truncate font-mono text-[11px] text-faint"
            title={p.identity?.label ?? ''}
          >
            {p.identity?.label ?? '—'}
          </div>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>

      {p.identity?.plan && (
        <div className="mt-2.5">
          <Pill>{p.identity.plan}</Pill>
        </div>
      )}

      <div className="mt-4 grow">
        {w && left !== null ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="tnum text-[18px] font-semibold tracking-[-0.02em]"
                style={{ color: quotaColour(w.usedPercent) }}
              >
                còn {left}%
              </span>
              <span className="text-[10.5px] text-faint">{windowLabel(w.windowSeconds)}</span>
            </div>
            <div className="mt-2 h-[4px] overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-spring)]"
                style={{
                  width: `${Math.max(2, left)}%`,
                  background: quotaColour(w.usedPercent)
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px]">
              <span className="text-faint">
                {w.resetAt ? `reset sau ${untilReset(w.resetAt, now)}` : ''}
              </span>
              {p.usage && (
                <span className={stale ? 'text-warn/80' : 'text-faint'}>
                  {readAge(p.usage.fetchedAt, now)}
                </span>
              )}
            </div>
          </>
        ) : p.usageError ? (
          <p className="truncate text-[11.5px] text-bad/90" title={p.usageError.message}>
            {p.usageError.message}
          </p>
        ) : (
          <p className="text-[11.5px] text-faint">chưa có dữ liệu quota</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-line/60 pt-3">
        {dead ? (
          <Button
            variant="pill"
            className="text-warn"
            onClick={() => onRepair(p.id)}
            disabled={busy}
          >
            <IconRefresh className="size-[13px] shrink-0" />
            Đăng nhập lại
          </Button>
        ) : state === 'uncaptured' ? (
          <Button variant="pill" onClick={() => onConfigure(p.id)}>
            Cấu hình
          </Button>
        ) : state === 'live' ? (
          <Button variant="pill" onClick={() => onRecapture(p.id)} disabled={busy}>
            <IconRefresh className="size-[13px] shrink-0" />
            Cập nhật
          </Button>
        ) : (
          <Button variant="pill" onClick={() => onSwitch(p.id)} disabled={busy}>
            Đổi sang
            <IconArrowRight className="size-[13px] shrink-0" />
          </Button>
        )}

        <span className="grow" />

        {state !== 'uncaptured' && (
          <IconAction label={`Cấu hình ${p.name}`} onClick={() => onConfigure(p.id)}>
            <IconSettings className="size-[14px]" />
          </IconAction>
        )}
        <IconAction label={`Xoá ${p.name}`} danger onClick={() => onDelete(p.id, p.name)}>
          <IconTrash className="size-[14px]" />
        </IconAction>
      </div>
    </li>
  )
}

// ── Fleet board: quota of every account ───────────────────────────

/**
 * Every account ranked by quota remaining, live pinned on top. The overview's
 * centrepiece: "toàn bộ account ra sao?" answered as one card per account in
 * a grid, each with its primary action plus configure/delete icon buttons.
 */
export function FleetCard({
  profiles,
  now,
  busy,
  index,
  className = '',
  onSwitch,
  onConfigure,
  onRepair,
  onRecapture,
  onDelete
}: {
  profiles: ProfileView[]
  now: number
  busy: boolean
  index: number
  className?: string
  onSwitch: (id: string) => void
  onConfigure: (id: string) => void
  onRepair: (id: string) => void
  onRecapture: (id: string) => void
  onDelete: (id: string, name: string) => void
}) {
  const rows = [...profiles].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const la = quotaLeft(a)
    const lb = quotaLeft(b)
    if (la === null && lb === null) return a.name.localeCompare(b.name)
    if (la === null) return 1
    if (lb === null) return -1
    return lb - la
  })
  const tile: TileActions = { busy, onSwitch, onConfigure, onRepair, onRecapture, onDelete }

  return (
    <Card className={`p-5 ${className}`} index={index}>
      <CardHead
        title="Quota theo account"
        sub="đang dùng ghim lên đầu, còn lại xếp theo quota giảm dần"
        right={<Chip>{profiles.length}</Chip>}
      />

      <ul className="mt-4 grid grow content-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {rows.map((p) => (
          <AccountTile key={p.id} p={p} now={now} {...tile} />
        ))}
      </ul>
    </Card>
  )
}

// ── All accounts, filterable (list view) ──────────────────────────

type Tab = 'all' | 'ready' | 'attention'

export function AccountsCard({
  profiles,
  now,
  busy,
  onSwitch,
  onRecapture,
  onConfigure,
  onRepair,
  onDelete,
  index,
  className = ''
}: {
  profiles: ProfileView[]
  now: number
  busy: boolean
  onSwitch: (id: string) => void
  onRecapture: (id: string) => void
  onConfigure: (id: string) => void
  onRepair: (id: string) => void
  onDelete: (id: string, name: string) => void
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
  const tile: TileActions = { busy, onSwitch, onConfigure, onRepair, onRecapture, onDelete }

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

      {rows.length === 0 ? (
        <p className="mt-4 grow rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint">
          Không có account nào khớp.
        </p>
      ) : (
        <ul className="mt-4 grid grow content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((p) => (
            <AccountTile key={p.id} p={p} now={now} {...tile} />
          ))}
        </ul>
      )}
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
