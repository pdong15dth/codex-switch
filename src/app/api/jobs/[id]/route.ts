import { fail, ok } from '@/lib/api'
import { getJob } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = getJob(id)
  if (!job) return fail(new Error('Job không tồn tại'), 404)
  return ok({ lines: job.lines, done: job.done, code: job.code, command: job.command })
}
