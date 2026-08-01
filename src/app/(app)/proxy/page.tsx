import { ProxyCard } from '@/components/ProxyCard'

export default function Page() {
  /* Proxy stands alone: it manages CLIProxyAPI's own account pool,
     which exists even when no profile is saved here yet. */
  return <ProxyCard index={0} />
}
