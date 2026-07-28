import { handle } from '@/lib/api'
import { openPrivate } from '@/lib/browser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Open a verification URL in a fresh, empty browser profile (host-allowlisted). */
export const POST = (req: Request) =>
  handle(async () => {
    const { url } = (await req.json()) as { url?: string }
    if (!url) throw new Error('Thiếu url')
    return await openPrivate(url)
  })
