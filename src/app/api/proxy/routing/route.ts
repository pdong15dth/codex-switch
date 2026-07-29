import { handle } from '@/lib/api'
import { getStrategy, setStrategy } from '@/lib/proxy-pool'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(() => getStrategy())

export const PUT = (req: Request) =>
  handle(async () => {
    const { strategy } = (await req.json()) as { strategy?: string }
    return setStrategy(strategy ?? '')
  })
