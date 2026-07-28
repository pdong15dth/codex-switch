import type { Preset } from '@/types'

/**
 * Built-in presets. Each one lists the files that actually carry the account
 * identity for a CLI — that is what a switch has to swap.
 *
 * Deliberately different from xoay-config's `claude-code` preset, which only
 * swaps `~/.claude/settings.json`. That file holds settings, not credentials
 * (the OAuth session lives in `~/.claude/.credentials.json` and the account
 * identity in `~/.claude.json`), so swapping it alone cannot change accounts.
 */
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    description:
      'Chuyển account Codex. auth.json giữ credential cho cả 2 chế độ: chatgpt (OAuth) và apikey.',
    categoryName: 'Codex CLI',
    defaultItems: [
      {
        type: 'file-replace',
        label: 'Codex auth.json (credential)',
        enabled: true,
        targetPath: '~/.codex/auth.json'
      },
      {
        type: 'file-replace',
        label: 'Codex config.toml (tuỳ chọn — prefs chung, không theo account)',
        enabled: false,
        targetPath: '~/.codex/config.toml'
      }
    ]
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description:
      'Chuyển account Claude Code. Swap OAuth credential + account identity, không phải settings.json.',
    categoryName: 'Claude Code',
    defaultItems: [
      {
        type: 'file-replace',
        label: 'Claude .credentials.json (OAuth token)',
        enabled: true,
        targetPath: '~/.claude/.credentials.json'
      },
      {
        type: 'file-replace',
        label: 'Claude .claude.json (oauthAccount, projects, mcpServers)',
        enabled: true,
        targetPath: '~/.claude.json'
      },
      {
        type: 'file-replace',
        label: 'Claude settings.json (tuỳ chọn — thường dùng chung mọi account)',
        enabled: false,
        targetPath: '~/.claude/settings.json'
      }
    ]
  },
  {
    id: 'blank',
    name: 'Trống',
    description: 'Không có item nào — tự thêm file/env/command theo ý bạn.',
    categoryName: 'Khác',
    defaultItems: []
  }
]

export function getPreset(id: string): Preset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id)
}
