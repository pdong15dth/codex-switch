'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/client'
import {
  AccountsCard,
  BackupsCard,
  FilesCard,
  LiveCard,
  StatsCard,
  TokenCard
} from './cards'
import { ConsoleCard } from './Console'
import { CreateProfileDialog } from './CreateProfileDialog'
import { ItemsModal } from './ItemsModal'
import { Rail, type View } from './Rail'
import { SwitchResultDialog } from './SwitchResultDialog'
import { TopBar } from './TopBar'
import { Button, ConfirmDialog, ErrorBar, Input, Modal } from './ui'
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

  return (
    <div className="flex min-h-dvh">
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

      <div className="flex min-w-0 grow flex-col">
        <TopBar
          view={view}
          now={now}
          busy={busy}
          onRefresh={refresh}
          onSave={() => setShowCreate(true)}
        />

        <main id="main" className="grow px-6 py-6">
          {error && (
            <div className="mb-5">
              <ErrorBar message={error} onDismiss={() => setError('')} />
            </div>
          )}

          {view === 'overview' && (
            <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <LiveCard
                live={live}
                now={now}
                busy={busy}
                onRecapture={() =>
                  live && run(async () => (await api.importCurrent(live.id)).state)
                }
                onConfigure={() => live && setConfiguring(live.id)}
                onSave={() => setShowCreate(true)}
              />
              <StatsCard
                profiles={profiles}
                backups={backups}
                index={1}
                onAdd={() => setShowCreate(true)}
                onRemoveLast={() => {
                  const last = [...profiles].sort((a, b) =>
                    b.createdAt.localeCompare(a.createdAt)
                  )[0]
                  if (last) askDelete(last.id, last.name)
                }}
              />
              <TokenCard live={live} backups={backups} now={now} index={2} />
              <FilesCard profiles={profiles} index={3} />
              <AccountsCard
                profiles={profiles}
                busy={busy}
                onSwitch={doSwitch}
                onConfigure={setConfiguring}
                index={4}
                className="lg:col-span-2"
              />
              <ConsoleCard onFinished={refresh} index={5} className="xl:col-span-2" />
              <BackupsCard backups={backups} index={6} />
            </div>
          )}

          {view === 'accounts' && (
            <div className="grid items-start gap-4 xl:grid-cols-3">
              <AccountsCard
                profiles={profiles}
                busy={busy}
                onSwitch={doSwitch}
                onConfigure={setConfiguring}
                index={0}
                className="xl:col-span-2"
              />
              <div className="grid gap-4">
                <StatsCard
                  profiles={profiles}
                  backups={backups}
                  index={1}
                  onAdd={() => setShowCreate(true)}
                  onRemoveLast={() => {
                    const last = [...profiles].sort((a, b) =>
                      b.createdAt.localeCompare(a.createdAt)
                    )[0]
                    if (last) askDelete(last.id, last.name)
                  }}
                />
                <FilesCard profiles={profiles} index={2} />
              </div>
            </div>
          )}

          {view === 'backups' && (
            <div className="grid items-start gap-4 xl:grid-cols-3">
              <BackupsCard backups={backups} index={0} className="xl:col-span-2" />
              <TokenCard live={live} backups={backups} now={now} index={1} />
            </div>
          )}

          {view === 'console' && (
            <div className="grid items-start gap-4 xl:grid-cols-3">
              <ConsoleCard onFinished={refresh} index={0} className="xl:col-span-2" />
              <LiveCard
                live={live}
                now={now}
                busy={busy}
                onRecapture={() =>
                  live && run(async () => (await api.importCurrent(live.id)).state)
                }
                onConfigure={() => live && setConfiguring(live.id)}
                onSave={() => setShowCreate(true)}
              />
            </div>
          )}
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
