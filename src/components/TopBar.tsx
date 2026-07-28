'use client'

import { IconClock, IconPlus, IconRefresh } from './icons'
import { Button } from './ui'

const TITLES: Record<string, { title: string; sub: string }> = {
  overview: { title: 'Tổng quan', sub: 'quota còn lại và thời điểm reset của từng account' },
  accounts: { title: 'Danh sách', sub: 'tất cả profile trong một bảng' },
  backups: { title: 'Backups', sub: 'mỗi lần switch tạo một bản backup' },
  console: { title: 'Thêm account', sub: 'login bằng Codex CLI rồi lưu thành profile' }
}

/** `now` is owned by Dashboard so every card reads the same tick. */
export function TopBar({
  view,
  now,
  busy,
  adding,
  onRefresh,
  onAdd
}: {
  view: string
  now: number
  busy: boolean
  adding: boolean
  onRefresh: () => void
  onAdd: () => void
}) {
  const date = new Date(now)
  const clock = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const weekday = date.toLocaleDateString('vi-VN', { weekday: 'short' })
  const meta = TITLES[view] ?? TITLES.overview

  return (
    // Sticky inside the scroll container rather than a sibling above it, so the
    // header and the cards share one content width even when a scrollbar shows.
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/92 backdrop-blur-md">
      {/* Same horizontal padding as the content grid, so the controls line up
          with the right edge of the cards below. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{meta.title}</h1>
          <p className="mt-0.5 truncate text-[11.5px] text-faint">{meta.sub}</p>
        </div>

        <span className="grow" />

        <Button variant="pill" onClick={onRefresh} disabled={busy} aria-label="Làm mới">
          <IconRefresh className={`size-[14px] ${busy ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>

        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12.5px] text-dim">
          <IconClock className="size-[14px] text-faint" />
          <span className="tnum">{clock}</span>
          <span className="text-faint">{weekday}</span>
        </span>

        <Button variant="primary" onClick={onAdd} disabled={adding}>
          <IconPlus className="size-[14px]" />
          Thêm account
        </Button>
      </div>
    </header>
  )
}
