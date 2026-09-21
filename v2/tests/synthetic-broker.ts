import { Decimal } from 'decimal.js'
import { BrokerFailure, brokerContractVersion, type BrokerProvider, type SessionVault } from '../server/broker-contract'
import type { HoldingsObservation } from '../server/broker-holdings'
import type { FinancialObservation } from '../server/financial-observation'
import { pluginHostVersion, type PluginDescriptor } from '../server/plugin-registry'

export const syntheticTime = '2026-09-21T10:00:00.000Z'
export interface SyntheticControl { partial?: boolean; reject?: boolean; wait?: boolean; malformed?: boolean; empty?: boolean; quantity?: string; failValuation?: boolean }
/** A test-only file-statement connector: access-code auth, account-ledger rows,
 * integer minor-unit prices/cash, USD rather than TR's bid/listing wire format. */
export function syntheticPlugin(controls = new Map<string,SyntheticControl>()): PluginDescriptor {
  const provider: BrokerProvider = {
    id: 'synthetic-ledger', version: '1.0.0', contractVersion: brokerContractVersion,
    auth: { fields: [{ id: 'access-code', label: 'Fixture access code', secret: true, pattern: '^[a-z-]+$', maxLength: 64 }], approval: 'none', restore: true },
    create: ({ connectionId,vault }) => {
      const control = () => controls.get(connectionId) ?? {}
      const raw = () => ({ ledger: 'same-account', securities: control().empty ? [] : [{ security: 'US0378331005', units: control().quantity ?? '2.125', minorPrice: '1234567890123456789' }], cashMinor: '1000000000000000001' })
      const holdings = async (signal: AbortSignal): Promise<HoldingsObservation> => {
        if (control().wait) await new Promise<void>((_,reject) => { signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')), { once: true }) })
        signal.throwIfAborted()
        if (control().reject) throw new BrokerFailure({ category: 'authentication' })
        const source = raw()
        return { completeness: control().partial ? 'partial' : !source.securities.length ? 'authoritative-empty' : 'complete', accounts: [source.ledger], snapshot: { fetchedAt: syntheticTime,
          positions: source.securities.map(s => ({ account: source.ledger, isin: s.security, name: 'Synthetic Apple ledger', quantity: control().malformed ? 'not-a-number' : s.units, averageBuyIn: '0', instrumentType: 'stock' })) } }
      }
      return {
        authenticate: async (input,signal,state) => { signal.throwIfAborted(); vault.setPassword(input['access-code']); state('connected') },
        restore: async signal => { signal.throwIfAborted(); return !!vault.getPassword() },
        readHoldings: holdings, fetch: async signal => (await holdings(signal)).snapshot,
        readObservations: async (_previous,save,signal) => {
          signal.throwIfAborted()
          if (control().failValuation) throw new BrokerFailure({ category: 'connection' })
          const source = raw()
          const common = { observedAt: syntheticTime, checkedAt: syntheticTime, completeness: 'success' as const, quotes: [], instruments: [], cash: [] }
          const observations: FinancialObservation[] = [
            { ...common, sourceId: 'instrumentDetails', instruments: source.securities.map(s => ({ isin:s.security, confirmedIsin:s.security, unit:'per-security', listings:[{ venue:'statement',currency:'USD',active:true }], failed:false })) },
            { ...common, sourceId:'quotes', quotes:source.securities.map(s => ({ isin:s.security, venue:'statement', price:new Decimal(s.minorPrice).div(100).toFixed(), time:Date.parse(syntheticTime), failed:false })) },
            { ...common, sourceId:'cash', cash:[{ accountId:source.ledger, currency:'USD', amount:new Decimal(source.cashMinor).div(100).toFixed() }] },
          ]
          for (const observation of observations) { signal.throwIfAborted(); save(observation) }
        },
        logout: () => { vault.deleteCredential() }, close() {}, warning: () => null,
      }
    },
  }
  return { id: 'synthetic-ledger-plugin', version:'1.0.0', compatibility:{ hostVersion:pluginHostVersion }, contributions:{ broker:provider,views:[] } }
}
export function memoryVaults() {
  const values = new Map<string,string>()
  const factory = (provider: string,id: string): SessionVault => {
    const key = `${provider}:${id}`
    return { getPassword: () => values.get(key) ?? null, setPassword: value => { values.set(key,value) }, deleteCredential: () => values.delete(key) }
  }
  return { values,factory }
}
