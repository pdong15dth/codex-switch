import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(() => buildStateView())
