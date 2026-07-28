import { Dashboard } from '@/components/Dashboard'
import { buildStateView } from '@/lib/inspect'

export const runtime = 'nodejs'
// State is read from disk on every load, so it must never be cached.
export const dynamic = 'force-dynamic'

export default async function Page() {
  return <Dashboard initialState={await buildStateView()} />
}
