'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { IconCheck, IconChevron } from './icons'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  hint?: string
}

/**
 * Native `<select>` renders the OS popup — a light grey list on Windows — which
 * has nothing to do with this theme. This is a listbox styled like the rest of
 * the app, with full keyboard support.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ariaLabel
}: {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  // Stable ids so the combobox can point at its listbox and active option.
  const uid = useId()
  const listId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-option-${i}`

  const selected = options.find((o) => o.value === value)

  // Close on outside click and on Escape from anywhere.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Keep the highlighted option in view when navigating with the keyboard.
  useEffect(() => {
    if (!open) return
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openAt = () => {
    const index = options.findIndex((o) => o.value === value)
    setActive(index < 0 ? 0 : index)
    setOpen(true)
  }

  const commit = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openAt()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(active)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={onKeyDown}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-sunken px-3 py-2 text-left text-sm transition-colors duration-200 ${
          open ? 'border-accent/60' : 'border-line hover:border-line2'
        }`}
      >
        <span className="min-w-0 grow truncate">{selected?.label ?? '—'}</span>
        <IconChevron
          className={`size-[13px] shrink-0 text-faint transition-transform duration-200 ${
            open ? '-rotate-90' : 'rotate-90'
          }`}
        />
      </button>

      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1.5 max-h-60 w-full min-w-max overflow-y-auto rounded-xl border border-line2/70 bg-card p-1 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset,0_18px_44px_-14px_rgb(0_0_0/0.85)]"
        >
          {options.map((option, i) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => commit(i)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
                    i === active ? 'bg-raised text-fg' : 'text-dim'
                  }`}
                >
                  <span className="min-w-0 grow">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-[11.5px] text-faint">{option.hint}</span>
                    )}
                  </span>
                  {isSelected && <IconCheck className="size-[13px] shrink-0 text-accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
