'use client'

import { useState } from 'react'
import { Button, Input, Modal, Pill, Select } from './ui'
import type { ConfigItem, ConfigItemView, ProfileView } from '@/types'

const TYPE_LABEL: Record<ConfigItem['type'], string> = {
  'file-replace': 'file',
  'env-var': 'env',
  'run-command': 'cmd'
}

/** Drop the disk-derived view fields before persisting an item. */
function toConfigItem(view: ConfigItemView): ConfigItem {
  const { matchesDisk, hasContent, targetExists, ...item } = view
  void matchesDisk
  void hasContent
  void targetExists
  return item as ConfigItem
}

function Status({ item }: { item: ConfigItemView }) {
  if (item.type === 'run-command') return null
  if (!item.hasContent) return <Pill tone="warn">chưa capture</Pill>
  if (item.matchesDisk) return <Pill tone="ok">khớp đĩa</Pill>
  if (!item.targetExists) return <Pill>chưa có file</Pill>
  return <Pill tone="info">khác đĩa</Pill>
}

function Row({
  item,
  onChange,
  onRemove
}: {
  item: ConfigItemView
  onChange: (next: ConfigItemView) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)

  const target =
    item.type === 'file-replace'
      ? item.targetPath
      : item.type === 'env-var'
        ? `${item.name} → ${item.shellFile}`
        : item.command

  return (
    <li
      className={`rounded-xl border transition-colors duration-200 ${
        open ? 'border-line2 bg-raised' : 'border-line/70 bg-raised/40 hover:border-line2'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={(e) => onChange({ ...item, enabled: e.target.checked })}
          className="size-[15px] shrink-0 cursor-pointer accent-accent"
          aria-label={`Bật ${item.label}`}
        />
        <div className="min-w-0 grow">
          <div className={`truncate text-[13px] ${item.enabled ? '' : 'text-faint line-through'}`}>
            {item.label}
          </div>
          <div className="truncate font-mono text-[11px] text-faint" title={target || undefined}>
            {target || '—'}
          </div>
        </div>
        <Pill>{TYPE_LABEL[item.type]}</Pill>
        <Status item={item} />
        <Button
          variant="ghost"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Thu gọn' : 'Sửa'}
          className="shrink-0 px-2"
        >
          {open ? '▾' : '✎'}
        </Button>
      </div>

      {open && (
        <div className="space-y-2.5 border-t border-line px-4 py-3.5">
          <Input
            className="w-full"
            value={item.label}
            placeholder="Nhãn"
            onChange={(e) => onChange({ ...item, label: e.target.value })}
          />

          {item.type === 'file-replace' && (
            <Input
              className="w-full font-mono text-[12.5px]"
              value={item.targetPath}
              placeholder="~/.codex/auth.json"
              onChange={(e) => onChange({ ...item, targetPath: e.target.value })}
            />
          )}

          {item.type === 'env-var' && (
            <div className="grid grid-cols-2 gap-2.5">
              <Input
                className="font-mono text-[12.5px]"
                value={item.name}
                placeholder="TÊN_BIẾN"
                onChange={(e) => onChange({ ...item, name: e.target.value })}
              />
              <Input
                className="font-mono text-[12.5px]"
                value={item.value}
                placeholder="giá trị"
                onChange={(e) => onChange({ ...item, value: e.target.value })}
              />
              <Input
                className="col-span-2 font-mono text-[12.5px]"
                value={item.shellFile}
                placeholder="file shell"
                onChange={(e) => onChange({ ...item, shellFile: e.target.value })}
              />
            </div>
          )}

          {item.type === 'run-command' && (
            <Input
              className="w-full font-mono text-[12.5px]"
              value={item.command}
              placeholder="lệnh cần chạy"
              onChange={(e) => onChange({ ...item, command: e.target.value })}
            />
          )}

          <div className="flex items-center justify-between gap-4 pt-0.5">
            <p className="text-[12px] text-faint">
              {item.type === 'file-replace' && item.hasContent
                ? `Đã capture ${new Intl.NumberFormat('vi-VN').format(item.content.length)} ký tự.`
                : null}
            </p>
            <Button variant="danger" onClick={onRemove} className="shrink-0">
              Xoá item
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

export function ItemsModal({
  profile,
  busy,
  onClose,
  onItemsChange,
  onRename,
  onImport,
  onDelete
}: {
  profile: ProfileView
  busy: boolean
  onClose: () => void
  onItemsChange: (items: ConfigItem[]) => void
  onRename: (name: string) => void
  onImport: () => void
  onDelete: () => void
}) {
  const [addType, setAddType] = useState<ConfigItem['type']>('file-replace')
  const [name, setName] = useState(profile.name)

  const commit = (views: ConfigItemView[]) => onItemsChange(views.map(toConfigItem))

  const addItem = () => {
    const base = { id: crypto.randomUUID(), label: 'Item mới', enabled: true }
    const next: ConfigItem =
      addType === 'file-replace'
        ? { ...base, type: 'file-replace', targetPath: '', content: '' }
        : addType === 'env-var'
          ? { ...base, type: 'env-var', name: '', value: '', shellFile: '' }
          : { ...base, type: 'run-command', command: '' }
    commit([...profile.items, next as ConfigItemView])
  }

  const commitName = () => {
    const next = name.trim()
    if (next && next !== profile.name) onRename(next)
  }

  return (
    <Modal
      title={`Cấu hình · ${profile.name}`}
      subtitle="Những file này sẽ bị ghi lại mỗi lần switch."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[12.5px] text-dim">Tên</div>
          <Input
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12.5px] text-dim">Config items</span>
            <span className="tnum text-[12px] text-faint">{profile.items.length}</span>
          </div>

          <ul className="space-y-1.5">
            {profile.items.length === 0 && (
              <li className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">
                Chưa có item nào.
              </li>
            )}
            {profile.items.map((item, index) => (
              <Row
                key={item.id}
                item={item}
                onChange={(next) => commit(profile.items.map((it, i) => (i === index ? next : it)))}
                onRemove={() => commit(profile.items.filter((_, i) => i !== index))}
              />
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select
              value={addType}
              onChange={(e) => setAddType(e.target.value as ConfigItem['type'])}
            >
              <option value="file-replace">file-replace</option>
              <option value="env-var">env-var</option>
              <option value="run-command">run-command</option>
            </Select>
            <Button onClick={addItem}>+ Thêm item</Button>
            <span className="grow" />
            <Button onClick={onImport} disabled={busy}>
              Import từ đĩa
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
          <Button variant="danger" onClick={onDelete} disabled={busy}>
            Xoá profile
          </Button>
          <Button variant="primary" onClick={onClose}>
            Xong
          </Button>
        </div>
      </div>
    </Modal>
  )
}
