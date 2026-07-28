import { handle } from '@/lib/api'
import { BUILTIN_PRESETS } from '@/lib/presets'
import { defaultShellFile } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () =>
  handle(async () => ({ presets: BUILTIN_PRESETS, defaultShellFile: defaultShellFile() }))
