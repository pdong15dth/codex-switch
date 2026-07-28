'use client'

import { useState } from 'react'
import { Button, Input, Label, Modal, Select } from './ui'
import type { Category, Preset } from '@/types'

export function CreateProfileDialog({
  presets,
  categories,
  initialCategoryId,
  onClose,
  onCreate
}: {
  presets: Preset[]
  categories: Category[]
  initialCategoryId: string | null
  onClose: () => void
  onCreate: (input: {
    name: string
    categoryId: string
    presetId: string
    importCurrent: boolean
  }) => void
}) {
  const initialCategory = categories.find((c) => c.id === initialCategoryId) ?? categories[0]

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(initialCategory?.id ?? '')
  const [presetId, setPresetId] = useState(
    // Default to the preset whose category matches where the user clicked "+".
    presets.find((p) => p.categoryName === initialCategory?.name)?.id ?? presets[0]?.id ?? ''
  )
  const [importNow, setImportNow] = useState(true)

  const selected = presets.find((p) => p.id === presetId)
  const valid = Boolean(name.trim() && categoryId && presetId)
  const submit = () => valid && onCreate({ name, categoryId, presetId, importCurrent: importNow })

  return (
    <Modal
      title="Profile mới"
      subtitle="Một profile là bản chụp config của một account."
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <Label>Tên profile</Label>
            <Input
              className="w-full"
              autoFocus
              value={name}
              placeholder="acc1"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Preset</Label>
          <div className="space-y-1.5">
            {presets.map((preset) => {
              const on = presetId === preset.id
              return (
                <label
                  key={preset.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-all duration-200 ${
                    on
                      ? 'border-accent/55 bg-accent/8 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]'
                      : 'border-line/70 bg-raised/40 hover:border-line2'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={on}
                    onChange={() => setPresetId(preset.id)}
                    className="mt-1 size-[15px] shrink-0 cursor-pointer accent-accent"
                  />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium">{preset.name}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-dim text-pretty">
                      {preset.description}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {selected && selected.defaultItems.length > 0 && (
          <div>
            <Label>File sẽ được quản lý</Label>
            <ul className="space-y-1.5 rounded-xl border border-line bg-sunken px-4 py-3 font-mono text-[11.5px]">
              {selected.defaultItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className={`size-[5px] shrink-0 rounded-full ${
                      item.enabled ? 'bg-accent' : 'bg-line2'
                    }`}
                  />
                  <span className={item.enabled ? 'text-fg' : 'text-faint'}>
                    {item.targetPath ?? item.name ?? item.command}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
            importNow ? 'border-accent/45 bg-accent/8' : 'border-line/70 bg-raised/40'
          }`}
        >
          <input
            type="checkbox"
            checked={importNow}
            onChange={(e) => setImportNow(e.target.checked)}
            className="mt-0.5 size-[15px] shrink-0 cursor-pointer accent-accent"
          />
          <span className="text-[13px]">
            Chụp luôn config đang có trên đĩa
            <span className="mt-0.5 block text-[12.5px] text-dim">
              Bật nếu bạn vừa đăng nhập account muốn lưu.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>
            Tạo profile
          </Button>
        </div>
      </div>
    </Modal>
  )
}
