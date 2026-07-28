'use client'

import { Button, Modal, Pill } from './ui'
import type { SwitchResult } from '@/types'

export function SwitchResultDialog({
  result,
  onClose
}: {
  result: SwitchResult
  onClose: () => void
}) {
  const failed = result.results.filter((r) => !r.success).length

  return (
    <Modal
      title={result.success ? 'Đã switch' : 'Switch không thành công'}
      subtitle={
        result.success
          ? `${result.results.length} item đã áp dụng.`
          : `${failed}/${result.results.length} item lỗi.`
      }
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        {result.rolledBack && (
          <p className="rounded-xl border border-warn/35 bg-warn/10 px-4 py-3 text-[13px] leading-relaxed text-warn text-pretty">
            Có item lỗi nên toàn bộ file đã được phục hồi từ backup — hệ thống trở về đúng trạng thái
            trước khi switch.
          </p>
        )}

        <ul className="space-y-1.5">
          {result.results.map((item) => (
            <li
              key={item.itemId}
              className="rounded-xl border border-line/70 bg-raised/45 px-4 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`size-[6px] shrink-0 rounded-full ${
                    item.success ? 'bg-accent' : 'bg-bad'
                  }`}
                />
                <span className="grow truncate text-[13.5px]">{item.label}</span>
                <Pill>{item.type}</Pill>
                {item.success ? <Pill tone="ok">ok</Pill> : <Pill tone="bad">lỗi</Pill>}
              </div>

              {item.error && <p className="mt-1.5 pl-4 text-[12.5px] text-bad">{item.error}</p>}

              {item.stdout?.trim() && (
                <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-sunken px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-dim">
                  {item.stdout.trim()}
                </pre>
              )}
              {item.stderr?.trim() && (
                <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-sunken px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-bad">
                  {item.stderr.trim()}
                </pre>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
          <span
            className="min-w-0 truncate font-mono text-[11px] text-faint"
            title={result.backupId}
          >
            backup {result.backupId}
          </span>
          <Button variant="primary" onClick={onClose} autoFocus>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  )
}
