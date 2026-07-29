import { handle } from '@/lib/api'
import { getUsageCounters } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(() => getUsageCounters())
