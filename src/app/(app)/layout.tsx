import { AppShell } from '@/components/AppShell'
import { buildStateView } from '@/lib/inspect'

export const runtime = 'nodejs'
// State is read from disk on every load, so it must never be cached.
export const dynamic = 'force-dynamic'

export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell initialState={await buildStateView()}>{children}</AppShell>
}
