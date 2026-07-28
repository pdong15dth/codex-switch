'use client'

import {
  IconAccounts,
  IconArchive,
  IconChevron,
  IconKey,
  IconOverview,
  IconPlus,
  IconTerminal
} from './icons'
import { Avatar } from './ui'
import type { Category, ProfileView } from '@/types'

export type View = 'overview' | 'accounts' | 'backups' | 'console'

const MAIN: { id: View; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { id: 'overview', label: 'Tổng quan', Icon: IconOverview },
  { id: 'accounts', label: 'Accounts', Icon: IconAccounts },
  { id: 'backups', label: 'Backups', Icon: IconArchive },
  { id: 'console', label: 'Console', Icon: IconTerminal }
]

function NavItem({
  label,
  active,
  collapsed,
  count,
  children,
  onClick
}: {
  label: string
  active: boolean
  collapsed: boolean
  count?: number
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-all duration-200 ${
        active
          ? 'bg-raised text-fg shadow-[0_1px_0_rgb(255_255_255/0.04)_inset]'
          : 'text-faint hover:bg-raised/50 hover:text-dim'
      }`}
    >
      {/* Active rail marker, matching the reference's left indicator. */}
      <span
        className={`absolute top-2 bottom-2 -left-2 w-[2px] rounded-full transition-all duration-200 ${
          active ? 'bg-accent' : 'bg-transparent'
        }`}
      />
      <span className={active ? 'text-accent' : ''}>{children}</span>
      {!collapsed && (
        <>
          <span className="grow truncate text-left">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="tnum text-[11px] text-faint">{count}</span>
          )}
        </>
      )}
    </button>
  )
}

export function Rail({
  view,
  onView,
  categories,
  scopeId,
  onScope,
  onNewCategory,
  profiles,
  live,
  collapsed,
  onToggle
}: {
  view: View
  onView: (v: View) => void
  categories: Category[]
  scopeId: string
  onScope: (id: string) => void
  onNewCategory: () => void
  profiles: ProfileView[]
  live: ProfileView | null
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-line bg-rail transition-[width] duration-300 ease-[var(--ease-spring)] ${
        collapsed ? 'w-[68px]' : 'w-[238px]'
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-accent/30 bg-accent/12 text-accent">
          <IconKey className="size-[16px]" />
        </span>
        {!collapsed && (
          <span className="grow truncate text-[14.5px] font-semibold tracking-[-0.02em]">
            Codex Switch
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className="shrink-0 cursor-pointer rounded-md p-1 text-faint transition-colors hover:bg-raised hover:text-fg"
        >
          <IconChevron
            className={`size-[15px] transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>
      </div>

      <nav className="grow overflow-y-auto px-4 pb-4">
        {!collapsed && (
          <div className="mb-2 px-1 text-[10px] font-semibold tracking-[0.14em] text-faint/70 uppercase">
            main
          </div>
        )}
        <div className="space-y-0.5">
          {MAIN.map(({ id, label, Icon }) => (
            <NavItem
              key={id}
              label={label}
              active={view === id}
              collapsed={collapsed}
              count={id === 'accounts' ? profiles.length : undefined}
              onClick={() => onView(id)}
            >
              <Icon className="size-[17px]" />
            </NavItem>
          ))}
        </div>

        {!collapsed && (
          <div className="mt-6 mb-2 px-1 text-[10px] font-semibold tracking-[0.14em] text-faint/70 uppercase">
            tools
          </div>
        )}
        <div className={`space-y-0.5 ${collapsed ? 'mt-6' : ''}`}>
          {categories.map((c) => {
            const on = c.id === scopeId
            const count = profiles.filter((p) => p.categoryId === c.id).length
            return (
              <button
                key={c.id}
                onClick={() => onScope(c.id)}
                title={collapsed ? c.name : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-all duration-200 ${
                  on ? 'bg-raised/70 text-fg' : 'text-faint hover:bg-raised/40 hover:text-dim'
                }`}
              >
                <span
                  className={`size-[7px] shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line2'}`}
                />
                {!collapsed && (
                  <>
                    <span className="grow truncate text-left">{c.name}</span>
                    <span className="tnum text-[11px] text-faint">{count}</span>
                  </>
                )}
              </button>
            )
          })}
          <button
            onClick={onNewCategory}
            title="Thêm nhóm tool"
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-faint transition-colors hover:bg-raised/40 hover:text-dim"
          >
            <IconPlus className="size-[13px] shrink-0" />
            {!collapsed && <span className="truncate">Nhóm mới</span>}
          </button>
        </div>
      </nav>

      {/* Pinned status card, in the slot the reference uses for its promo. */}
      {!collapsed && (
        <div className="p-3">
          <div
            className={`rounded-2xl border p-3.5 ${
              live ? 'border-accent/25 bg-accent/8' : 'border-line bg-card'
            }`}
          >
            {live ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="pulse-dot size-[7px] rounded-full bg-accent" aria-hidden />
                  <span className="text-[10px] font-semibold tracking-[0.13em] text-accent uppercase">
                    đang dùng
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2.5">
                  <Avatar name={live.name} size={30} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{live.name}</div>
                    <div className="truncate font-mono text-[10.5px] text-faint">
                      {live.identity?.label ?? '—'}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-semibold tracking-[0.13em] text-faint uppercase">
                  chưa khớp profile
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">
                  Config trên đĩa không giống profile nào đã lưu.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
