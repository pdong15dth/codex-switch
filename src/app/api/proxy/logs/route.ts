import { handle } from '@/lib/api'
import { getLogs } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(async () => ({ logs: getLogs() }))
