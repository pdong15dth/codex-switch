import type { ConfigItemView } from '@/types'

export type FileItemView = Extract<ConfigItemView, { type: 'file-replace' }>

/** `.filter()` cannot narrow a union on its own — this predicate does it. */
export const enabledFileItems = (items: ConfigItemView[]): FileItemView[] =>
  items.filter((i): i is FileItemView => i.enabled && i.type === 'file-replace')
