import { createHmac } from 'node:crypto'
import type { TotpConfig } from '@/types'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32, tolerating the spaces, dashes and padding people paste. */
function base32Decode(input: string): Buffer {
  const clean = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '')

  let bits = 0
  let value = 0
  const out: number[] = []

  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index === -1) throw new Error(`Secret có ký tự không hợp lệ: "${char}"`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  if (!out.length) throw new Error('Secret rỗng')
  return Buffer.from(out)
}

const ALGORITHMS = new Set(['sha1', 'sha256', 'sha512'])

/**
 * Accepts either a bare base32 secret or a full `otpauth://totp/...` URI, so a
 * QR-code payload can be pasted straight in.
 */
export function parseTotp(input: string): TotpConfig {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Chưa nhập secret')

  if (/^otpauth:\/\//i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      throw new Error('URI otpauth không hợp lệ')
    }
    const secret = url.searchParams.get('secret')
    if (!secret) throw new Error('URI otpauth thiếu tham số secret')

    const digits = Number(url.searchParams.get('digits') ?? 6)
    const period = Number(url.searchParams.get('period') ?? 30)
    const algorithm = (url.searchParams.get('algorithm') ?? 'sha1').toLowerCase()

    const config: TotpConfig = {
      secret,
      digits: digits === 8 ? 8 : 6,
      period: Number.isFinite(period) && period > 0 ? period : 30,
      algorithm: ALGORITHMS.has(algorithm) ? algorithm : 'sha1',
      label: decodeURIComponent(url.pathname.replace(/^\/+/, '')) || null
    }
    base32Decode(config.secret) // fail now rather than at first use
    return config
  }

  base32Decode(trimmed)
  return { secret: trimmed, digits: 6, period: 30, algorithm: 'sha1', label: null }
}

export interface TotpCode {
  code: string
  /** Unix ms when this code stops being valid. */
  expiresAt: number
  period: number
}

/** Generate the current code. HMAC over the counter, then dynamic truncation. */
export function totpNow(config: TotpConfig, now = Date.now()): TotpCode {
  const key = base32Decode(config.secret)
  const period = config.period || 30
  const counter = Math.floor(now / 1000 / period)

  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac(config.algorithm || 'sha1', key).update(buf).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]

  const digits = config.digits === 8 ? 8 : 6
  const code = String(binary % 10 ** digits).padStart(digits, '0')

  return { code, expiresAt: (counter + 1) * period * 1000, period }
}
