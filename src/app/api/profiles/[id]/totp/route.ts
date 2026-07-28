import { fail, handle, ok } from '@/lib/api'
import { buildStateView } from '@/lib/inspect'
import { loadState, saveState } from '@/lib/storage'
import { parseTotp, totpNow } from '@/lib/totp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Return the current 2FA code for a profile.
 *
 * The code is generated here so the shared secret never reaches the browser;
 * only the six digits and the expiry do.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const state = await loadState()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) return fail(new Error('Không tìm thấy profile'), 404)
  if (!profile.totp?.secret) return fail(new Error('Profile này chưa có 2FA secret'), 404)

  try {
    return ok(totpNow(profile.totp))
  } catch (err) {
    return fail(err)
  }
}

/** Store or clear a profile's 2FA secret. */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { id } = await params
    const { secret } = (await req.json()) as { secret?: string | null }

    const state = await loadState()
    const profile = state.profiles.find((p) => p.id === id)
    if (!profile) throw new Error('Không tìm thấy profile')

    if (!secret || !secret.trim()) {
      profile.totp = null
    } else {
      // Parse eagerly: a bad secret should fail here, not at first use.
      profile.totp = parseTotp(secret)
    }

    profile.updatedAt = new Date().toISOString()
    await saveState(state)
    return { state: await buildStateView() }
  })
