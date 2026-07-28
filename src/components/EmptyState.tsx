'use client'

import { IconArrowRight, IconKey } from './icons'
import { Button, Card } from './ui'

const STEPS = [
  {
    title: 'Bấm “Login & lưu profile”',
    body: 'Tool chạy codex login và mở browser cho bạn.'
  },
  {
    title: 'Xác nhận trong browser',
    body: 'Bạn đăng nhập account của mình ở đó — đây là bước duy nhất bạn phải làm tay.'
  },
  {
    title: 'Profile được lưu tự động',
    body: (
      <>
        Tool đọc credential vừa ghi ra và tự đặt tên profile theo email trong token — không cần
        điền gì thêm.
      </>
    )
  },
  {
    title: 'Lặp lại cho các account còn lại',
    body: 'Mỗi lần bấm lại là thêm một account. Sau đó đổi qua lại bằng một click.'
  }
]

/**
 * Shown when a tool group has no profiles yet. A fresh install rendering six
 * zero-value widgets reads as broken, so replace the grid entirely.
 */
export function EmptyState({
  toolName,
  onSave,
  busy,
  className = ''
}: {
  toolName: string
  onSave: () => void
  busy: boolean
  className?: string
}) {
  return (
    <Card className={`overflow-hidden p-7 sm:p-9 ${className}`} index={0}>
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

          <Button variant="primary" className="mt-7" onClick={onSave} disabled={busy}>
            <IconKey className="size-[14px]" />
            Login &amp; lưu profile
            <IconArrowRight className="size-[14px]" />
          </Button>
          <p className="mt-3 text-[12px] text-faint">
            Đã đăng nhập bằng <code className="font-mono">codex</code> ở terminal rồi? Bấm nút này
            vẫn được — hoặc dùng <b className="font-medium text-dim">Status</b> ở card bên phải để
            kiểm tra.
          </p>
        </div>
      </div>
    </Card>
  )
}
