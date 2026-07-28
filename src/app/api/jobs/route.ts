import { handle } from '@/lib/api'
import { startJob } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (req: Request) =>
  handle(async () => {
    const { action } = (await req.json()) as { action?: string }
    const job = startJob(action ?? '')
    return { jobId: job.id, command: job.command }
  })
