import { handle } from '@/lib/api'
import { parseTotp, totpNow } from '@/lib/totp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-off OTP: take a secret, return the current code. Stateless on purpose —
 * nothing is written to disk, so a secret pasted here for a single sign-in is
 * not left lying around. Save it on a profile instead if you want it kept.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const { secret } = (await req.json()) as { secret?: string }
    if (!secret?.trim()) throw new Error('Chưa nhập secret')
    return totpNow(parseTotp(secret))
  })
