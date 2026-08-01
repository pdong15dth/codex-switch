'use client'

import { useApp } from './AppShell'
import { AccountsCard, BackupsCard, BestPickCard, FleetCard, LiveCard, SummaryBar } from './cards'
import { ConsoleCard } from './Console'
import { HistoryCard } from './HistoryCard'
import { TotpCard } from './TotpCard'
import { UsageChartCard } from './UsageChartCard'

/* One component per route; all shared state and handlers come from AppShell. */

export function OverviewView() {
  const {
    state,
    profiles,
    now,
    busy,
    live,
    backups,
    add,
    recapture,
    configure,
    doSwitch,
    doRepair,
    askDelete
  } = useApp()

  return (
    /* Decision-first layout: live account + quota, the recommended
       switch target, then every account's quota ranked. Chart and
       history sit below as secondary context. */
    <>
      <SummaryBar profiles={profiles} now={now} />
      <div className="grid gap-4 xl:grid-cols-3">
        <LiveCard
          live={live}
          now={now}
          busy={busy}
          index={0}
          className="xl:col-span-2"
          onRecapture={() => live && recapture(live.id)}
          onConfigure={() => live && configure(live.id)}
          onAdd={() => add.start('codex-login')}
        />
        <BestPickCard
          profiles={profiles}
          now={now}
          busy={busy}
          index={1}
          onSwitch={doSwitch}
          onAdd={() => add.start('codex-login')}
          onConfigure={configure}
          onRepair={doRepair}
        />
        <FleetCard
          profiles={profiles}
          now={now}
          busy={busy}
          index={2}
          className="xl:col-span-3"
          onSwitch={doSwitch}
          onConfigure={configure}
          onRepair={doRepair}
          onRecapture={recapture}
          onDelete={askDelete}
        />
        <UsageChartCard
          profiles={profiles}
          history={state.usageHistory}
          index={3}
          className="xl:col-span-2"
        />
        <HistoryCard profiles={profiles} backups={backups} history={state.usageHistory} index={4} />
      </div>
    </>
  )
}

export function AccountsView() {
  const { profiles, now, busy, doSwitch, doRepair, recapture, configure, askDelete } = useApp()

  return (
    <>
      <SummaryBar profiles={profiles} now={now} />
      <AccountsCard
        profiles={profiles}
        now={now}
        busy={busy}
        onSwitch={doSwitch}
        onRecapture={recapture}
        onConfigure={configure}
        onRepair={doRepair}
        onDelete={askDelete}
        index={0}
      />
    </>
  )
}

export function BackupsView() {
  const { backups } = useApp()
  return <BackupsCard backups={backups} index={0} />
}

export function ConsoleView() {
  const { add } = useApp()

  return (
    /* The add-account route is where a 2FA code gets typed, so the
       generator belongs beside the login flow. */
    <div className="grid gap-4 xl:grid-cols-3">
      <ConsoleCard add={add} index={0} className="xl:col-span-2" />
      <TotpCard index={1} />
    </div>
  )
}
