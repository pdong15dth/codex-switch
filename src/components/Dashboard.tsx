'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client'
import { AccountsCard, BackupsCard, LiveCard, QuotaCard, SummaryBar, SwitchCard } from './cards'
import { HistoryCard } from './HistoryCard'
import { TotpCard } from './TotpCard'
import { UsageChartCard } from './UsageChartCard'
import { ConsoleCard } from './Console'
import { CreateProfileDialog } from './CreateProfileDialog'
import { EmptyState } from './EmptyState'
import { ItemsModal } from './ItemsModal'
import { Rail, type View } from './Rail'
import { SwitchResultDialog } from './SwitchResultDialog'
import { TopBar } from './TopBar'
import { Button, ConfirmDialog, ErrorBar, Input, Modal } from './ui'
import { useAddAccount } from './useAddAccount'
// Presets are static data with no Node imports, so the client uses them
// directly instead of round-tripping through /api/presets.
import { BUILTIN_PRESETS } from '@/lib/presets'
import type { ConfigItem, StateView, SwitchResult } from '@/types'

interface Confirmation {
  title: string
  message: string
  confirmLabel: string
  action: () => Promise<StateView | void>
}

/** Initial state comes from the server render, so there is no mount fetch. */
export function Dashboard({ initialState }: { initialState: StateView }) {
  const [state, setState] = useState(initialState)
  // Seeded from the server render so hydration matches, then ticked here so
  // every card reads one consistent clock instead of calling Date.now() itself.
  const [now, setNow] = useState(initialState.now)
  const [view, setView] = useState<View>('overview')
  const [scope, setScope] = useState(initialState.categories[0]?.id ?? '')
  const [collapsed, setCollapsed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [switchResult, setSwitchResult] = useState<SwitchResult | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [newCategory, setNewCategory] = useState<string | null>(null)

  /** Wrap a mutation so errors surface in one place and the UI can't double-fire. */
  const run = useCallback(async (fn: () => Promise<StateView | void>) => {
    setBusy(true)
    setError('')
    try {
      const next = await fn()
      if (next) setState(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      setState(await api.state())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Poll so the live marker stays honest when the CLI is used directly.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busy && !switchResult && !showCreate && !configuring && !confirmation) refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [busy, switchResult, showCreate, configuring, confirmation, refresh])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  /** Quota comes from the network, so it refreshes far less often than state. */
  const refreshUsage = useCallback(async () => {
    try {
      setState((await api.refreshUsage()).state)
    } catch {
      // Quota is best-effort: a failure leaves the cached figures in place.
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(refreshUsage, 300_000)
    // Kick off once on mount via the same callback the interval uses.
    const first = setTimeout(refreshUsage, 0)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, [refreshUsage])

  const category = state.categories.find((c) => c.id === scope) ?? state.categories[0]
  const profiles = state.profiles.filter((p) => p.categoryId === category?.id)
  const live = profiles.find((p) => p.active) ?? null
  const backups = state.backups.filter((b) => profiles.some((p) => p.id === b.profileId))
  const configured = configuring ? state.profiles.find((p) => p.id === configuring) : null

  const askDelete = (id: string, name: string) =>
    setConfirmation({
      title: 'Xoá profile',
      message: `Xoá profile “${name}”? Snapshot credential trong profile này sẽ mất. File đang dùng trên đĩa không bị ảnh hưởng.`,
      confirmLabel: 'Xoá profile',
      action: async () => {
        setConfiguring(null)
        return (await api.deleteProfile(id)).state
      }
    })

  const doSwitch = (id: string) =>
    run(async () => {
      const { result, state: next } = await api.switchProfile(id)
      setSwitchResult(result)
      return next
    })

  const accountsProps = {
    profiles,
    now,
    busy,
    onSwitch: doSwitch,
    onRecapture: (id: string) => run(async () => (await api.importCurrent(id)).state),
    onConfigure: setConfiguring
  }

  // Drives login -> browser confirmation -> auto-capture for the active tool.
  const add = useAddAccount({
    categoryId: category?.id ?? '',
    presetId: category?.name === 'Claude Code' ? 'claude-code' : 'codex-cli',
    onState: setState
  })

  return (
    // App shell: the page itself never scrolls, only the content region does, so
    // the rail stays fully visible.
    <div className="flex h-dvh overflow-hidden">
      <Rail
        view={view}
        onView={setView}
        categories={state.categories}
        scopeId={category?.id ?? ''}
        onScope={setScope}
        onNewCategory={() => setNewCategory('')}
        profiles={profiles}
        live={live}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />

      <div className="min-w-0 grow overflow-y-auto">
        <TopBar
          view={view}
          now={now}
          busy={busy}
          adding={add.busy}
          onRefresh={() => {
            refresh()
            refreshUsage()
          }}
          onAdd={() => add.start('codex-login')}
        />

        <main id="main" className="px-6 py-6">
          <div>
            {error && (
              <div className="mb-5">
                <ErrorBar message={error} onDismiss={() => setError('')} />
              </div>
            )}

            {profiles.length === 0 ? (
              /* Nothing saved yet: onboarding rather than six zero-value widgets. */
              <div className="grid gap-4 xl:grid-cols-3">
                <EmptyState
                  toolName={category?.name ?? ''}
                  onSave={() => add.start('codex-login')}
                  busy={add.busy}
                  className="xl:col-span-2"
                />
                <ConsoleCard add={add} index={1} />
              </div>
            ) : view === 'overview' ? (
              /* Mixed card grid: live account, quota gauge, quick switch, 2FA,
                 add-account and backups. */
              <>
                <SummaryBar
                  profiles={profiles}
                  now={now}
                  adding={add.busy}
                  onAdd={() => add.start('codex-login')}
                />
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  <LiveCard
                    live={live}
                    now={now}
                    busy={busy}
                    index={0}
                    onRecapture={() =>
                      live && run(async () => (await api.importCurrent(live.id)).state)
                    }
                    onConfigure={() => live && setConfiguring(live.id)}
                    onAdd={() => add.start('codex-login')}
                  />
                  <QuotaCard live={live} now={now} index={1} />
                  <TotpCard index={2} />
                  <UsageChartCard
                    profiles={profiles}
                    history={state.usageHistory}
                    index={3}
                    className="lg:col-span-2"
                  />
                  <HistoryCard
                    profiles={profiles}
                    backups={backups}
                    history={state.usageHistory}
                    index={4}
                  />
                  <SwitchCard
                    profiles={profiles}
                    now={now}
                    busy={busy}
                    index={5}
                    className="lg:col-span-2"
                    onSwitch={doSwitch}
                    onConfigure={setConfiguring}
                  />
                  <BackupsCard backups={backups} index={6} />
                  <ConsoleCard add={add} index={7} className="lg:col-span-2 xl:col-span-3" />
                </div>
              </>
            ) : view === 'accounts' ? (
              <>
                <SummaryBar
                  profiles={profiles}
                  now={now}
                  adding={add.busy}
                  onAdd={() => add.start('codex-login')}
                />
                <AccountsCard {...accountsProps} index={0} />
              </>
            ) : view === 'backups' ? (
              <BackupsCard backups={backups} index={0} />
            ) : (
              <ConsoleCard add={add} index={0} />
            )}
          </div>
        </main>
      </div>

      {showCreate && category && (
        <CreateProfileDialog
          presets={BUILTIN_PRESETS}
          categories={state.categories}
          initialCategoryId={category.id}
          onClose={() => setShowCreate(false)}
          onCreate={(input) =>
            run(async () => {
              const next = (await api.createProfile(input)).state
              setShowCreate(false)
              return next
            })
          }
        />
      )}

      {configured && (
        <ItemsModal
          profile={configured}
          busy={busy}
          onClose={() => setConfiguring(null)}
          onItemsChange={(items: ConfigItem[]) =>
            run(async () => (await api.updateProfile(configured.id, { items })).state)
          }
          onRename={(name) =>
            run(async () => (await api.updateProfile(configured.id, { name })).state)
          }
          onImport={() => run(async () => (await api.importCurrent(configured.id)).state)}
          onDelete={() => askDelete(configured.id, configured.name)}
          onSetTotp={(secret) =>
            run(async () => (await api.setTotp(configured.id, secret)).state)
          }
        />
      )}

      {newCategory !== null && (
        <Modal title="Nhóm tool mới" onClose={() => setNewCategory(null)}>
          <Input
            className="w-full"
            autoFocus
            value={newCategory}
            placeholder="Ví dụ: Gemini CLI"
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !newCategory.trim()) return
              const name = newCategory
              setNewCategory(null)
              run(async () => (await api.createCategory(name)).state)
            }}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setNewCategory(null)}>Huỷ</Button>
            <Button
              variant="primary"
              disabled={!newCategory.trim()}
              onClick={() => {
                const name = newCategory
                setNewCategory(null)
                run(async () => (await api.createCategory(name)).state)
              }}
            >
              Tạo
            </Button>
          </div>
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const { action } = confirmation
            setConfirmation(null)
            run(action)
          }}
        />
      )}

      {switchResult && (
        <SwitchResultDialog result={switchResult} onClose={() => setSwitchResult(null)} />
      )}
    </div>
  )
}
