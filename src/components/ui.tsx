'use client'

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { IconDots } from './icons'

type Variant = 'default' | 'primary' | 'danger' | 'ghost' | 'pill'

const VARIANTS: Record<Variant, string> = {
  default: 'rounded-lg bg-raised border-line hover:border-line2 hover:bg-line/50',
  primary:
    'rounded-lg bg-accent border-accent text-[#04120c] font-semibold hover:brightness-110 shadow-[0_2px_14px_-4px_rgba(46,224,160,0.55)]',
  danger: 'rounded-lg bg-raised border-line text-dim hover:border-bad/60 hover:text-bad',
  ghost: 'rounded-lg bg-transparent border-transparent text-dim hover:bg-raised hover:text-fg',
  // The reference's control style: fully rounded, quiet border, icon + label.
  pill: 'rounded-full bg-card border-line text-dim hover:border-line2 hover:text-fg'
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-[13px] transition-all duration-200 ease-[var(--ease-spring)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-lg border border-line bg-sunken px-3 py-2 text-sm transition-colors duration-200 outline-none placeholder:text-faint hover:border-line2 focus:border-accent/60 ${className}`}
    />
  )
}

/** Rounded search field, as used inside the reference's cards. */
export function SearchInput({
  className = '',
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border border-line bg-sunken px-3.5 py-2 transition-colors focus-within:border-accent/50 ${className}`}
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <input
        {...props}
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
    </div>
  )
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`cursor-pointer rounded-lg border border-line bg-sunken px-3 py-2 text-sm transition-colors duration-200 outline-none hover:border-line2 focus:border-accent/60 ${className}`}
    >
      {children}
    </select>
  )
}

type Tone = 'neutral' | 'ok' | 'info' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  neutral: 'border-line2/70 bg-raised text-dim',
  ok: 'border-accent/35 bg-accent/12 text-accent',
  info: 'border-info/35 bg-info/12 text-info',
  warn: 'border-warn/35 bg-warn/12 text-warn',
  bad: 'border-bad/35 bg-bad/12 text-bad'
}

/** Status pill, as in the reference table (Paid / Claimed / Pending). */
export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

/** The small delta / percentage chip that sits in a card's top-right corner. */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`tnum inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[12.5px] text-dim">{children}</div>
}

export function Card({
  className = '',
  live,
  index = 0,
  children
}: {
  className?: string
  live?: boolean
  index?: number
  children: ReactNode
}) {
  return (
    <section
      className={`rise ${live ? 'card-live' : 'card'} ${className}`}
      style={{ ['--i' as string]: index }}
    >
      {children}
    </section>
  )
}

export function CardHead({
  title,
  sub,
  right,
  onMenu
}: {
  title: string
  sub?: string
  right?: ReactNode
  onMenu?: () => void
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-[13.5px] font-medium">{title}</h3>
        {sub && <p className="mt-0.5 truncate text-[11.5px] text-faint">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label="Tuỳ chọn"
            className="cursor-pointer rounded-md p-1 text-faint transition-colors hover:bg-raised hover:text-fg"
          >
            <IconDots className="size-[15px]" />
          </button>
        )}
      </div>
    </header>
  )
}

/** Segmented tab row used inside cards. */
export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { id: T; label: string; count?: number }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-sunken p-1">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-current={on ? 'true' : undefined}
            className={`cursor-pointer rounded-full px-3 py-1 text-[12px] transition-all duration-200 ${
              on ? 'bg-raised text-fg' : 'text-faint hover:text-dim'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className="tnum ml-1.5 text-[11px] text-faint">{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-5 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className={`card mt-[7vh] mb-8 w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-dim">{subtitle}</p>}
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" className="shrink-0 px-2">
            ✕
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xoá',
  onConfirm,
  onCancel
}: {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-[13.5px] leading-relaxed text-dim text-pretty">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Huỷ</Button>
        <Button
          autoFocus
          onClick={onConfirm}
          className="border-bad/60 bg-bad/15 text-bad hover:bg-bad/25"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function ErrorBar({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-bad/35 bg-bad/10 px-4 py-3 text-[13px] text-[#f0aca2]"
    >
      <span className="grow break-words text-pretty">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Bỏ qua"
          className="shrink-0 cursor-pointer rounded px-1 text-faint transition-colors hover:text-fg"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** Deterministic accent per name, so each account keeps its colour. */
const AVATAR_TONES = [
  'bg-accent/18 text-accent border-accent/30',
  'bg-info/18 text-info border-info/30',
  'bg-warn/18 text-warn border-warn/30',
  'bg-lime/18 text-lime border-lime/30',
  'bg-bad/18 text-bad border-bad/30'
]

export function avatarTone(name: string): string {
  let sum = 0
  for (const ch of name) sum += ch.codePointAt(0) ?? 0
  return AVATAR_TONES[sum % AVATAR_TONES.length]
}

/**
 * First character plus the last alphanumeric one, so acc1/acc2/acc3 read as
 * A1/A2/A3 instead of three identical "AC" tiles.
 */
export function initials(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '')
  if (!clean) return '??'
  if (clean.length === 1) return clean.toUpperCase()
  return (clean[0] + clean[clean.length - 1]).toUpperCase()
}

/** Rounded square, not a circle — circles are the default everywhere. */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] border font-semibold ${avatarTone(name)}`}
    >
      <span style={{ fontSize: size * 0.42 }}>{initials(name)}</span>
    </span>
  )
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * "còn 3h 12m" / "đã hết hạn" — the token countdown. `now` is passed in rather
 * than read from the clock so callers stay pure during render.
 */
export function formatRemaining(
  iso: string | null | undefined,
  now: number
): { text: string; expired: boolean } {
  if (!iso) return { text: '—', expired: false }
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return { text: 'đã hết hạn', expired: true }
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return { text: `còn ${d}n ${h % 24}h`, expired: false }
  if (h >= 1) return { text: `còn ${h}h ${mins % 60}m`, expired: false }
  return { text: `còn ${mins}m`, expired: false }
}
