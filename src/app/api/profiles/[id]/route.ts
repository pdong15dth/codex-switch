import { handle } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { deleteProfile, updateProfile } from '@/lib/storage'
import type { ConfigItem } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params
    const body = (await req.json()) as { name?: string; items?: ConfigItem[] }
    await updateProfile(id, body)
    return { state: await buildStateView() }
  })

export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params
    await deleteProfile(id)
    return { state: await buildStateView() }
  })
