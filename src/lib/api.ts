import { NextResponse } from 'next/server'

export const ok = <T>(data: T) => NextResponse.json(data, { headers: { 'cache-control': 'no-store' } })

export const fail = (err: unknown, status = 400) =>
  NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status, headers: { 'cache-control': 'no-store' } }
  )

/** Wrap a handler so thrown errors become a 400 with a readable message. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn())
  } catch (err) {
    return fail(err)
  }
}
