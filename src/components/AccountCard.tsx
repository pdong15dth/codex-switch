'use client'

import { IconArrowRight, IconClock, IconRefresh } from './icons'
import { TotpCode } from './TotpCode'
import { Avatar, Button, Card, Pill, formatDate } from './ui'
import { enabledFileItems } from '@/lib/items'
import { windowLabel } from '@/lib/usage'
import type { ProfileView, UsageWindow } from '@/types'

/** "6 ngày 4h" / "42m" — how long until a rate-limit window resets. */
function untilReset(resetAt: string | null, now: number): string | null {
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

function quotaTone(used: number): { colour: string; tone: 'ok' | 'warn' | 'bad' } {
  if (used >= 90) return { colour: 'var(--color-bad)', tone: 'bad' }
  if (used >= 65) return { colour: 'var(--color-warn)', tone: 'warn' }
  return { colour: 'var(--color-accent)', tone: 'ok' }
}

/**
 * One rate-limit window. The backend reports `used_percent`, so remaining is
 * `100 - used` — both are labelled outright, because a bare "0%" reads as
 * "nothing left" when it actually means "nothing used".
 *
 * The countdown comes from `reset_at`; `limit_window_seconds` only names the
 * window (5 giờ / 7 ngày).
 */
function Quota({ window: w, now }: { window: UsageWindow; now: number }) {
  const used = Math.max(0, Math.min(100, w.usedPercent))
  const left = 100 - used
  const { colour } = quotaTone(used)
  const reset = untilReset(w.resetAt, now)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] tracking-[0.06em] text-faint uppercase">
          quota {windowLabel(w.windowSeconds)}
        </span>
        <span className="tnum text-[11px] text-faint">đã dùng {Math.round(used)}%</span>
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="tnum text-[22px] leading-none font-semibold tracking-[-0.02em]" style={{ color: colour }}>
          {Math.round(left)}%
        </span>
        <span className="text-[12px] text-dim">còn lại</span>
      </div>

      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line" title={`đã dùng ${used}%`}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-spring)]"
          style={{ width: `${Math.max(2, used)}%`, background: colour }}
        />
      </div>

      {reset && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
          <IconClock className="size-[11px] shrink-0" />
          reset sau {reset}
        </div>
      )}
    </div>
  )
}

/**
 * One card per account: who it is, how much quota is left, when it resets, and
 * a single click to switch to it.
 */
export function AccountCard({
  profile,
  now,
  busy,
  index,
  onSwitch,
  onRecapture,
  onConfigure
}: {
  profile: ProfileView
  now: number
  busy: boolean
  index: number
  onSwitch: () => void
  onRecapture: () => void
  onConfigure: () => void
}) {
  const files = enabledFileItems(profile.items)
  const uncaptured = files.length === 0 || files.some((f) => !f.hasContent)
  const usage = profile.usage
  const windows = [usage?.primary, usage?.secondary].filter(Boolean) as UsageWindow[]

  return (
    <Card className="p-5" live={profile.active} index={index}>
      <header className="flex items-start gap-3">
        <Avatar name={profile.name} size={40} />
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {profile.name}
            </h3>
            {profile.active && (
              <span className="pulse-dot size-[6px] shrink-0 rounded-full bg-accent" aria-hidden />
            )}
          </div>
          <p
            className="truncate font-mono text-[11.5px] text-faint"
            title={profile.identity?.label ?? undefined}
          >
            {profile.identity?.label ?? '—'}
          </p>
        </div>
        {profile.identity?.plan && <Pill tone={profile.active ? 'ok' : 'neutral'}>{profile.identity.plan}</Pill>}
      </header>

      {/* Quota is the point of the card, so it sits directly under the name. */}
      <div className="mt-4 space-y-3.5">
        {uncaptured ? (
          <p className="rounded-xl border border-bad/30 bg-bad/8 px-3.5 py-2.5 text-[12.5px] text-bad">
            Chưa capture credential — bấm Cấu hình rồi Import từ đĩa.
          </p>
        ) : windows.length > 0 ? (
          windows.map((w) => <Quota key={w.windowSeconds} window={w} now={now} />)
        ) : (
          <p className="rounded-xl border border-line bg-raised/40 px-3.5 py-2.5 text-[12.5px] text-dim">
            Chưa đọc được quota. Bấm{' '}
            <b className="font-medium text-fg">Làm mới</b> khi account này đang active.
          </p>
        )}

        {usage?.limitReached && <Pill tone="bad">đã hết quota</Pill>}
      </div>

      {profile.hasTotp && (
        <div className="mt-4 rounded-xl border border-line bg-raised/40 px-3.5 py-3">
          <div className="mb-2 text-[10.5px] tracking-[0.1em] text-faint uppercase">mã 2fa</div>
          <TotpCode profileId={profile.id} name={profile.name} />
        </div>
      )}

      {/* Only provenance here. The access-token countdown was noise: the CLI
          refreshes it on its own and the snapshot is re-synced automatically. */}
      <dl className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3.5 text-[11.5px]">
        <dt className="text-faint">quota đọc lúc</dt>
        <dd className="tnum text-dim">{usage ? formatDate(usage.fetchedAt) : 'chưa đọc'}</dd>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {profile.active ? (
          <>
            <Pill tone="ok">đang dùng</Pill>
            <span className="grow" />
            <Button variant="pill" onClick={onRecapture} disabled={busy} title="Chụp lại credential">
              <IconRefresh className="size-[13px] shrink-0" />
              Cập nhật
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onSwitch} disabled={busy || uncaptured}>
              Đổi sang account này
              <IconArrowRight className="size-[13px] shrink-0" />
            </Button>
            <span className="grow" />
          </>
        )}
        <button
          onClick={onConfigure}
          aria-label={`Cấu hình ${profile.name}`}
          title="Cấu hình"
          className="cursor-pointer rounded-md px-2 py-1 text-[13px] text-faint transition-colors hover:bg-raised hover:text-fg"
        >
          ⋯
        </button>
      </div>
    </Card>
  )
}
