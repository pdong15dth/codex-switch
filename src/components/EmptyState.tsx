'use client'

import { IconArrowRight, IconKey } from './icons'
import { Button, Card } from './ui'

const STEPS = [
  {
    title: 'Đăng nhập account đầu tiên',
    body: (
      <>
        Ở card <b className="font-medium text-fg">Codex CLI</b> bên phải, bấm{' '}
        <b className="font-medium text-fg">Login (browser)</b>.
      </>
    )
  },
  {
    title: 'Lưu nó thành profile',
    body: (
      <>
        Bấm <b className="font-medium text-fg">Lưu account</b>, chọn preset{' '}
        <b className="font-medium text-fg">Codex CLI</b>, đặt tên{' '}
        <code className="font-mono text-fg">acc1</code>.
      </>
    )
  },
  {
    title: 'Lặp lại cho các account còn lại',
    body: (
      <>
        Đăng nhập account tiếp theo rồi lưu thành <code className="font-mono text-fg">acc2</code>,{' '}
        <code className="font-mono text-fg">acc3</code>.
      </>
    )
  },
  {
    title: 'Đổi account bằng một click',
    body: 'Từ đó bảng Accounts sẽ hiện nút đổi sang cho từng account.'
  }
]

/**
 * Shown when a tool group has no profiles yet. A fresh install rendering six
 * zero-value widgets reads as broken, so replace the grid entirely.
 */
export function EmptyState({ toolName, onSave }: { toolName: string; onSave: () => void }) {
  return (
    <Card className="overflow-hidden p-7 sm:p-9" index={0}>
      <div className="relative">
        <div className="pointer-events-none absolute -top-16 -left-10 size-56 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative max-w-xl">
          <span className="inline-flex size-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/12 text-accent">
            <IconKey className="size-[19px]" />
          </span>

          <h2 className="mt-4 text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
            Chưa có account {toolName} nào được lưu
          </h2>
          <p className="mt-2.5 text-[14px] leading-relaxed text-dim text-pretty">
            Mỗi profile là bản chụp file credential của một account. Đổi account nghĩa là ghi lại
            đúng file đó — có backup trước mỗi lần, và rollback nếu lỗi.
          </p>

          <ol className="mt-7 space-y-0">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rise flex gap-4 border-b border-line/60 py-3.5 last:border-0"
                style={{ ['--i' as string]: i + 1 }}
              >
                <span className="tnum mt-0.5 w-6 shrink-0 font-mono text-[12px] text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{step.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-dim text-pretty">
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <Button variant="primary" className="mt-7" onClick={onSave}>
            Lưu account đang đăng nhập
            <IconArrowRight className="size-[14px]" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
