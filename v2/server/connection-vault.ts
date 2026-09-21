import { scopedVault } from './credential-scope'
import { Entry } from '@napi-rs/keyring'
import type { SessionVault } from './broker-contract'
/** The one migrated TR connection retains its existing credential alias. New
 * connections cannot ask for another connection's credential-store entry. */
export function connectionVault(providerId: string, connectionId: string, defaultId: string): SessionVault {
  if (!/^[a-z][a-z0-9-]*$/.test(providerId) || !/^[0-9a-f-]{36}$/.test(connectionId)) throw Error('Invalid credential scope')
  return scopedVault(new Entry('PortfolioPrismV2', providerId === 'trade-republic' && connectionId === defaultId ? 'trade-republic-session' : `${providerId}:${connectionId}:session`))
}
