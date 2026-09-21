import { randomUUID } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { decodeInvestigationCommand, type Scope, type ManualEvidence } from '../contracts/investigations'
import { sameScope, latestManual, manualCompatibility, manualIneligibility } from './manual-valuation'
import { valueObservations } from './valuation'
import type { SnapshotStore } from './store'
export class InvestigationInputError extends Error {}
export function investigationReport(store: SnapshotStore, now = Date.now()) {
  const journal = store.investigations.snapshot()
  const items = store.connectionInputs().flatMap(input => {
    const broker = valueObservations(input.snapshot, input.observations, now, input.quantities)
    const valued = valueObservations(input.snapshot, input.observations, now, input.quantities, 'verified-listings', { connectionId: input.connection.id, evidence: journal.evidence })
    return broker.rows.filter(p => new Decimal(p.quantity).gt(0)).map(row => {
      const scope = { connectionId: input.connection.id, account: row.account, isin: row.isin }
      const decision = journal.decisions.filter(d => sameScope(d.scope, scope)).at(-1)
      const evidence = journal.evidence.filter(e => sameScope(e.scope, scope))
      const manual = latestManual(evidence, scope)
      const basis = input.quantities.find(p => p.account === row.account && p.isin === row.isin)
      const inactive = manual && input.snapshot ? manualIneligibility(manual, row, input.observations, basis, input.snapshot, now) : null
      const selected = row.value === null && !!manual && !inactive
      const instrument = input.observations.find(s => s.sourceId === 'instrumentDetails')?.instruments.find(i => i.isin === row.isin)
      const allowedCurrencies = [...new Set((instrument?.listings ?? []).flatMap(l => l.currency && !manualCompatibility(row, input.observations, l.currency) ? [l.currency] : []))]
      return { scope, name: row.name, state: decision?.state ?? 'open' as const, reason: decision?.reason ?? '',
        value: valued.rows.find(p => p.account === row.account && p.isin === row.isin)!.value,
        currency: selected ? manual!.currency : row.currency,
        manualStatus: !manual ? evidence.some(e => e.kind === 'price') ? 'Manual price revoked; prior revisions remain saved' : 'No active manual price'
          : row.value !== null ? 'Inactive: eligible broker value takes precedence' : inactive ? `Inactive: ${inactive}` : `Manual price fallback selected${now - Date.parse(manual.asOf!) > 86400000 ? ' · older than 24h' : ''}`,
        manualEvidence: manual, evidence, manualAllowed: allowedCurrencies.length > 0, allowedCurrencies,
        quantityObservedAt: basis?.observedAt ?? null, decisionAt: decision?.recordedAt ?? null,
        brokerValue: row.value, brokerReason: row.quality,
      }
    }).filter(item => item.brokerValue === null || item.evidence.length || journal.decisions.some(d => sameScope(d.scope, item.scope)))
  })
  return { items, counts: { open: items.filter(i => i.value === null && i.state === 'open').length,
    excluded: items.filter(i => i.state === 'excluded').length,
    manualSupported: items.filter(i => i.manualStatus.startsWith('Manual price fallback selected')).length } }
}
export function executeInvestigation(store: SnapshotStore, value: unknown, now = Date.now()) {
  let command: ReturnType<typeof decodeInvestigationCommand>
  try { command = decodeInvestigationCommand(value) } catch { throw new InvestigationInputError('Invalid investigation input. Check the scope, decimal, currency, date and evidence fields.') }
  const scope: Scope = command.scope
  const input = store.connectionInputs().find(i => i.connection.id === scope.connectionId)
  const position = input?.snapshot?.positions.find(p => p.account === scope.account && p.isin === scope.isin)
  if (!input?.snapshot || !position || !new Decimal(position.quantity).gt(0)) throw new InvestigationInputError('Select an existing positive held position in this connection and account.')
  const basis = input.quantities.find(p => p.account === scope.account && p.isin === scope.isin)
  let fields: Omit<ManualEvidence, 'id' | 'recordedAt'> | null = null
  if (command.action === 'price') {
    fields = { scope, kind: 'price', price: command.price, currency: command.currency, asOf: command.asOf, source: command.source, reason: command.reason, unit: command.unit, quantity: position.quantity, quantityObservedAt: basis?.observedAt ?? null, revokes: null }
    const invalid = manualIneligibility({ ...fields, id: randomUUID(), recordedAt: new Date(now).toISOString() }, position, input.observations, basis, input.snapshot, now)
    if (invalid) throw new InvestigationInputError(invalid)
  } else if (command.action === 'note') fields = { scope, kind: 'note', price: null, currency: null, asOf: null, source: command.source, reason: command.reason, unit: null, quantity: null, quantityObservedAt: null, revokes: null }
  else if (command.action === 'revoke') {
    const active = latestManual(store.investigations.snapshot().evidence, scope)
    if (!active || active.id !== command.evidenceId) throw new InvestigationInputError('Only the current active manual price in this account can be revoked.')
    fields = { scope, kind: 'revoke', price: null, currency: null, asOf: null, source: 'User revocation', reason: command.reason, unit: null, quantity: null, quantityObservedAt: null, revokes: active.id }
  }
  return store.investigationTransaction(() => {
    if (command.action === 'decide') store.investigations.appendDecision(scope, command.state, command.reason, now)
    else store.investigations.appendEvidence(fields!, now)
    const run = store.history.start('manual-evidence', randomUUID(), new Date(now).toISOString())
    const checkpoint = store.history.capture(run, 'manual-evidence', randomUUID(), now, false)
    store.history.finish(run, 'succeeded')
    return { ...investigationReport(store, now), checkpointId: checkpoint?.checkpoint.id ?? null }
  })
}
