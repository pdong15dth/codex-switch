'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client'
import type { ProxyAccountView, ProxyLogEntry, ProxyStrategy, ProxyView } from '@/types'
import { Dropdown } from './Dropdown'
import { Button, Card, CardHead, Pill, formatRemaining, formatTime } from './ui'

const STRATEGY_OPTIONS: { value: ProxyStrategy; label: string; hint: string }[] = [
  { value: 'round-robin', label: 'round-robin', hint: 'xoay vòng đều giữa các account' },
  { value: 'fill-first', label: 'fill-first', hint: 'xài cạn 1 account rồi mới chuyển' }
]

function statusPill(account: ProxyAccountView) {
  if (account.status === 'active') return <Pill tone="ok">active</Pill>
  if (account.status === 'cooldown') return <Pill tone="warn">cooldown</Pill>
  return <Pill tone="bad">dead</Pill>
}

function logStatusPill(entry: ProxyLogEntry) {
  if (entry.status < 300) return <Pill tone="ok">{entry.status}</Pill>
  if (entry.status === 429) return <Pill tone="warn">429</Pill>
  return <Pill tone="bad">{entry.status}</Pill>
}

/** lastError can be a JSON error body — pull the human message out. */
function errorReason(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string
      message?: string
      detail?: string
    }
    const fromError = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message
    return fromError ?? parsed?.message ?? parsed?.detail ?? raw
  } catch {
    return raw
  }
}

const compactNumber = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${n}`

/**
 * The built-in Codex proxy: pool status + inbound key, the account pool, and
 * the recent request log. Status polls on the Dashboard's 4-second rhythm;
 * logs/strategy poll slower since they change less.
 */
export function ProxyCard({ index, className = '' }: { index: number; className?: string }) {
  const [view, setView] = useState<ProxyView | null>(null)
  const [logs, setLogs] = useState<ProxyLogEntry[] | null>(null)
  const [strategy, setStrategy] = useState<ProxyStrategy | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [routingBusy, setRoutingBusy] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const refreshStatus = useCallback(async () => {
    try {
      setView(await api.proxyStatus())
    } catch {
      // Keep the last good view on a failed poll.
    }
  }, [])

  const refreshSlow = useCallback(async () => {
    try {
      setLogs((await api.proxyLogs()).logs)
    } catch {
      // best-effort
    }
    try {
      const { strategy: s } = await api.proxyRouting()
      if (STRATEGY_OPTIONS.some((o) => o.value === s)) setStrategy(s as ProxyStrategy)
    } catch {
      // best-effort
    }
  }, [])

  useEffect(() => {
    // Kick off once on mount via the same callback the interval uses.
    const first = setTimeout(refreshStatus, 0)
    const timer = setInterval(() => {
      setNow(Date.now())
      void refreshStatus()
    }, 4000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [refreshStatus])

  useEffect(() => {
    const first = setTimeout(refreshSlow, 0)
    const timer = setInterval(refreshSlow, 20_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [refreshSlow])

  const resetCooldown = async (account: ProxyAccountView) => {
    setResetting(account.id)
    setError('')
    try {
      await api.proxyResetQuota(account.id)
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResetting(null)
    }
  }

  const changeStrategy = async (next: ProxyStrategy) => {
    setRoutingBusy(true)
    setError('')
    try {
      const { strategy: s } = await api.proxySetRouting(next)
      if (STRATEGY_OPTIONS.some((o) => o.value === s)) setStrategy(s as ProxyStrategy)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRoutingBusy(false)
    }
  }

  const activeCount = view?.accounts.filter((a) => a.status === 'active').length ?? 0

  return (
    <div className={`grid gap-4 xl:grid-cols-3 ${className}`}>
      {error && (
        <div className="xl:col-span-3">
          <p className="rounded-xl border border-bad/35 bg-bad/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-bad text-pretty">
            {error}
          </p>
        </div>
      )}

      {/* ── Tổng quan ── */}
      <Card className="p-5" index={index}>
        <CardHead
          title="Tổng quan"
          sub={view ? `proxy nội bộ · ${view.version}` : 'đang đọc trạng thái…'}
          right={
            <Pill tone="ok">
              <span className="pulse-dot size-[6px] rounded-full bg-accent" aria-hidden />
              đang chạy
            </Pill>
          }
        />

        {view && (
          <div className="mt-4 grow space-y-4">
            <div>
              <div className="mb-1.5 text-[12.5px] text-dim">Base URL (chuẩn OpenAI)</div>
              <code className="block rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[12.5px]">
                {view.baseUrl}/v1
              </code>
            </div>

            <div>
              <div className="mb-1.5 text-[12.5px] text-dim">API key</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 grow truncate rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[12.5px]">
                  {revealed ? view.apiKey : `${view.apiKey.slice(0, 6)}${'•'.repeat(12)}`}
                </code>
                <Button className="shrink-0" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? 'Ẩn' : 'Hiện'}
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[12.5px] text-dim">Chiến lược điều phối</div>
              {strategy ? (
                <Dropdown
                  ariaLabel="Chiến lược điều phối"
                  value={strategy}
                  options={STRATEGY_OPTIONS}
                  onChange={(s) => {
                    if (!routingBusy) void changeStrategy(s)
                  }}
                  className={routingBusy ? 'pointer-events-none opacity-50' : ''}
                />
              ) : (
                <div className="rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-faint">
                  đang đọc…
                </div>
              )}
            </div>

            <p className="tnum text-[12px] text-faint">
              {activeCount}/{view.accounts.length} account active
            </p>
          </div>
        )}
      </Card>

      {/* ── Accounts ── */}
      <Card className="p-5 xl:col-span-2" index={index + 1}>
        <CardHead title="Accounts" sub="pool session Codex mà proxy điều phối" />

        {view && view.accounts.length === 0 && (
          <p className="mt-4 text-[12.5px] leading-relaxed text-dim text-pretty">
            Pool chưa có account nào. Import session bằng POST /api/proxy/import với nội dung file
            session Codex.
          </p>
        )}

        {view && view.accounts.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
              {view.accounts.map((a) => {
              const reason = a.lastError ? errorReason(a.lastError) : ''
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <Pill tone={a.provider === 'codex' ? 'info' : 'neutral'}>{a.provider}</Pill>
                  <div className="min-w-0 grow">
                    <div className="truncate text-[13px]" title={a.email}>
                      {a.email}
                    </div>
                    <div className="tnum mt-0.5 text-[11px] text-faint">
                      {a.usage.requests} req · {a.usage.failed} lỗi ·{' '}
                      {compactNumber(a.usage.inputTokens)} in / {compactNumber(a.usage.outputTokens)}{' '}
                      out
                      {a.status === 'cooldown' && a.cooldownUntil && (
                        <>
                          {' '}
                          · hết cooldown {formatTime(a.cooldownUntil)} (
                          {formatRemaining(a.cooldownUntil, now).text})
                        </>
                      )}
                    </div>
                    {reason && (
                      <div className="mt-0.5 truncate text-[11.5px] text-bad/90" title={reason}>
                        {reason}
                      </div>
                    )}
                  </div>
                  {a.status === 'cooldown' && (
                    <Button
                      disabled={resetting === a.id}
                      onClick={() => resetCooldown(a)}
                      className="shrink-0"
                    >
                      {resetting === a.id ? 'Đang xoá…' : 'Xoá cooldown'}
                    </Button>
                  )}
                  {statusPill(a)}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* ── Nhật ký request ── */}
      <Card className="p-5 xl:col-span-3" index={index + 2}>
        <CardHead title="Nhật ký request" sub="50 request gần nhất qua pool" />
        {logs === null ? (
          <p className="mt-4 text-[12.5px] text-faint">đang đọc…</p>
        ) : logs.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-dim">Chưa có request nào.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {logs.map((l, i) => (
              <li key={`${l.at}-${i}`} className="flex items-center gap-3 py-2.5">
                <span className="tnum w-14 shrink-0 text-[12px] text-faint">{formatTime(l.at)}</span>
                {logStatusPill(l)}
                <span className="shrink-0 font-mono text-[12px] text-faint">{l.model}</span>
                <span className="max-w-44 shrink-0 truncate text-[12px] text-faint" title={l.account}>
                  {l.account}
                </span>
                <span className="min-w-0 grow truncate text-[12.5px] text-dim" title={l.message}>
                  {l.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
