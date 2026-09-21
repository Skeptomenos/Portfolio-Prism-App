import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { Decimal } from 'decimal.js'
import { decodeEventCashBalance, decodeEventCoverage, decodeEventObservationDate, decodeEvent, ledgerContractVersion, type LedgerEvent, type SavedEvent, type LedgerReadModel, type EventCoverage, type ReconciliationRow } from '../contracts/events'
import type { BrokerEventBatch } from './broker-events'
import { sanitizePayload, type Json } from './explorer'
import type { ConnectionInputs } from './connection-store'

export const D = Decimal.clone({ precision: 256 })
export const eventHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const sum = (values: readonly string[]) => values.reduce((n,v) => n.add(v),new D(0)).toFixed()

export class EventLedger {
  constructor(private readonly db: DatabaseSync) {}
  static migrate(db: DatabaseSync) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE ledger_event_versions(seq INTEGER PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES broker_connections(id), source_id TEXT NOT NULL, hash TEXT NOT NULL, observed_at TEXT NOT NULL, payload TEXT NOT NULL, evidence TEXT NOT NULL, UNIQUE(connection_id,source_id,hash));
      CREATE TABLE ledger_cash_observations(connection_id TEXT NOT NULL REFERENCES broker_connections(id), hash TEXT NOT NULL, observed_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(connection_id,hash));
      CREATE TABLE ledger_event_heads(connection_id TEXT NOT NULL REFERENCES broker_connections(id), source_id TEXT NOT NULL, version_id INTEGER NOT NULL REFERENCES ledger_event_versions(seq), observed_at TEXT NOT NULL, PRIMARY KEY(connection_id,source_id));
      CREATE TABLE ledger_event_acquisition(connection_id TEXT PRIMARY KEY REFERENCES broker_connections(id), observed_at TEXT NOT NULL, coverage TEXT NOT NULL, state TEXT NOT NULL);
      PRAGMA user_version=13; COMMIT;`)
  }
  state(connectionId: string): Json | null {
    const row = this.db.prepare('SELECT state FROM ledger_event_acquisition WHERE connection_id=?').get(connectionId)
    return row ? JSON.parse(String(row.state)) : null
  }
  coverage(connectionId: string): EventCoverage | null {
    const row = this.db.prepare('SELECT coverage FROM ledger_event_acquisition WHERE connection_id=?').get(connectionId)
    return row ? decodeEventCoverage(JSON.parse(String(row.coverage))) : null
  }
  save(connectionId: string, batch: BrokerEventBatch) {
    if(batch.contractVersion!=='broker-events/1')throw Error('Invalid event batch')
    decodeEventObservationDate(batch.observedAt)
    const coverage=decodeEventCoverage(batch.coverage)
    const prior = this.db.prepare('SELECT observed_at FROM ledger_event_acquisition WHERE connection_id=?').get(connectionId)
    if (prior && Date.parse(String(prior.observed_at)) > Date.parse(batch.observedAt)) throw Error('Event observation regressed')
    const ids = new Set<string>()
    const values = batch.events.map(({ event: input, evidence }) => {
      const event = decodeEvent(input)
      if (ids.has(event.sourceId)) throw Error('Ambiguous duplicate event identity')
      ids.add(event.sourceId)
      const safe = sanitizePayload(evidence)
      if (eventHash(safe) !== event.evidenceHash) throw Error('Event evidence mismatch')
      if (event.status !== 'executed' && (event.cash.length || event.securities.length)) throw Error('Non-economic event has booked legs')
      if (event.cash.some(c => !new D(c.amount).isFinite()) || event.securities.some(s => !new D(s.quantity).isFinite())) throw Error('Invalid event decimal')
      if(event.status==='executed'&&event.kind==='unknown')throw Error('Unsupported economic kind')
      if(event.status==='executed'&&['buy','withdrawal','card-payment'].includes(event.kind)&&event.cash.some(c=>new D(c.amount).gte(0)))throw Error('Invalid outgoing event sign')
      if(event.status==='executed'&&['sell','deposit','card-refund','dividend','interest'].includes(event.kind)&&event.cash.some(c=>new D(c.amount).lt(0)))throw Error('Invalid incoming event sign')
      if(event.kind==='buy'&&event.securities.some(s=>new D(s.quantity).lte(0))||event.kind==='sell'&&event.securities.some(s=>new D(s.quantity).gte(0)))throw Error('Invalid trade quantity sign')
      return { event, evidence: JSON.stringify(safe), hash: eventHash(event) }
    })
    const cashBalances=(batch.cashBalances??[]).map(value=>decodeEventCashBalance(value))
    const state = JSON.stringify(sanitizePayload(batch.state))
    if (Buffer.byteLength(state) > 32 * 1024 * 1024) throw Error('Event continuation exceeds storage limit')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for(const cash of cashBalances) {
        this.db.prepare('INSERT OR IGNORE INTO ledger_cash_observations VALUES (?,?,?,?)').run(connectionId,eventHash(cash),cash.observedAt,JSON.stringify(cash))
      }
      for (const value of values) {
        this.db.prepare('INSERT OR IGNORE INTO ledger_event_versions(connection_id,source_id,hash,observed_at,payload,evidence) VALUES (?,?,?,?,?,?)')
          .run(connectionId,value.event.sourceId,value.hash,batch.observedAt,JSON.stringify(value.event),value.evidence)
        const seq = this.db.prepare('SELECT seq FROM ledger_event_versions WHERE connection_id=? AND source_id=? AND hash=?').get(connectionId,value.event.sourceId,value.hash)!.seq
        this.db.prepare('INSERT INTO ledger_event_heads VALUES (?,?,?,?) ON CONFLICT(connection_id,source_id) DO UPDATE SET version_id=excluded.version_id,observed_at=excluded.observed_at').run(connectionId,value.event.sourceId,seq!,batch.observedAt)
      }
      this.db.prepare('INSERT INTO ledger_event_acquisition VALUES (?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET observed_at=excluded.observed_at,coverage=excluded.coverage,state=excluded.state')
        .run(connectionId,batch.observedAt,JSON.stringify(coverage),state)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  events(): SavedEvent[] {
    return this.db.prepare(`SELECT v.*,h.observed_at AS selected_at,c.provider_id,(SELECT count(*) FROM ledger_event_versions r WHERE r.connection_id=v.connection_id AND r.source_id=v.source_id) AS revisions
      FROM ledger_event_heads h JOIN ledger_event_versions v ON h.version_id=v.seq JOIN broker_connections c ON v.connection_id=c.id ORDER BY v.seq`).all().map(row => {
      const event=decodeEvent(JSON.parse(String(row.payload)))
      if(eventHash(event)!==row.hash||eventHash(JSON.parse(String(row.evidence)))!==event.evidenceHash)throw Error('Saved event integrity mismatch')
      return {...event,connectionId:String(row.connection_id),providerId:String(row.provider_id),versionId:Number(row.seq),revisionCount:Number(row.revisions),observedAt:String(row.selected_at)}
    })
  }
  read(inputs: readonly ConnectionInputs[]): LedgerReadModel {
    const events = this.events().sort((a,b) => Date.parse(b.occurredAt ?? '')-Date.parse(a.occurredAt ?? '') || b.versionId-a.versionId)
    const connections = inputs.map(i => ({ id:i.connection.id,providerId:i.connection.providerId,coverage:this.coverage(i.connection.id) }))
    const booked = events.filter(e => e.status === 'executed')
    const reversed = new Set<number>()
    for(const e of booked) {
      if(!e.reversesSourceId)continue
      const targets=booked.filter(t=>t.connectionId===e.connectionId&&t.sourceId===e.reversesSourceId&&t.accountId===e.accountId&&!t.reversesSourceId)
      if(targets.length!==1)continue
      const t=targets[0]
      if(booked.filter(x=>x.connectionId===e.connectionId&&x.accountId===e.accountId&&x.reversesSourceId===t.sourceId).length!==1)continue
      const opposite=(a:readonly {key:string;amount:string}[],b:readonly {key:string;amount:string}[])=>a.length===b.length&&a.every(x=>b.filter(y=>y.key===x.key).length===1&&new D(x.amount).add(b.find(y=>y.key===x.key)!.amount).isZero())
      if(opposite(e.cash.map(c=>({key:c.currency,amount:c.amount})),t.cash.map(c=>({key:c.currency,amount:c.amount})))&&opposite(e.securities.map(c=>({key:JSON.stringify([c.accountId,c.isin]),amount:c.quantity})),t.securities.map(c=>({key:JSON.stringify([c.accountId,c.isin]),amount:c.quantity})))) {reversed.add(e.versionId);reversed.add(t.versionId)}
    }
    const eligible = booked.filter(e=>!reversed.has(e.versionId))
    // Pair only an explicit provider reference, scoped by connection, with exactly
    // opposite legs and different known accounts. Same amounts/dates are not identity.
    const paired = new Set<number>()
    for (const e of eligible) {
      if (!e.transferReference || !e.accountId || !['deposit','withdrawal'].includes(e.kind) || e.cash.length!==1 || e.securities.length) continue
      const matches = eligible.filter(x => x.connectionId===e.connectionId && x.transferReference===e.transferReference)
      if (matches.length!==2) continue
      const other=matches.find(x=>x.versionId!==e.versionId)!
      if (other.kind===(e.kind==='deposit'?'withdrawal':'deposit') && !other.securities.length && other.accountId && other.accountId!==e.accountId && other.cash.length===1 && other.cash[0].currency===e.cash[0].currency && new D(other.cash[0].amount).add(e.cash[0].amount).isZero()) { paired.add(e.versionId);paired.add(other.versionId) }
    }
    const totals = [...new Set(booked.flatMap(e=>e.cash.map(c=>c.currency)))].sort().map(currency => {
      const amount=(kinds:LedgerEvent['kind'][]) => sum(eligible.filter(e=>kinds.includes(e.kind)&&!paired.has(e.versionId)).flatMap(e=>e.cash.filter(c=>c.currency===currency).map(c=>new D(c.amount).abs().toFixed())))
      return { currency,netCashMovement:sum(eligible.flatMap(e=>e.cash.filter(c=>c.currency===currency).map(c=>c.amount))),purchases:amount(['buy']),sales:amount(['sell']),cashAdded:amount(['deposit']),cashWithdrawn:amount(['withdrawal']),income:amount(['dividend','interest']),spending:amount(['card-payment']),internalTransfers:eligible.filter(e=>paired.has(e.versionId)&&e.cash.some(c=>c.currency===currency)).length/2 }
    })
    return {contractVersion:ledgerContractVersion,events,connections,totals,reconciliation:reconcileEvents(events,inputs,this.db.prepare('SELECT connection_id,hash,observed_at,payload FROM ledger_cash_observations ORDER BY observed_at').all().map(r=>{const raw=JSON.parse(String(r.payload));if(eventHash(raw)!==r.hash)throw Error('Saved cash integrity mismatch');const cash=decodeEventCashBalance(raw);if(cash.observedAt!==r.observed_at)throw Error('Saved cash metadata mismatch');return {...cash,connectionId:String(r.connection_id)}})),gaps:[
      'Observed cash additions and withdrawals are not a verified external-capital total. Transfer scope and statement comparison remain open.',
      ...(connections.some(c=>!c.coverage)?['Some connections have no acquired event history.']:[]),
      ...(connections.some(c=>c.coverage?.olderAvailable!==false)?['Older event pages may remain. Continue backfill.']:[]),
      ...(connections.some(c=>c.coverage?.detailsPending || c.coverage?.failedDetails)?['Event details are incomplete. Acquire another bounded batch to retry.']:[]),
      ...(connections.some(c=>c.coverage?.recentGap)?['The recent refresh has an unclosed page gap. Sync again to continue it.']:[]),
    ]}
  }
}

/** This compares supplied snapshot boundaries; it never manufactures events. Cash
 * needs dated, account-scoped opening/closing observations and remains explicit. */
export function reconcileEvents(events: readonly SavedEvent[], inputs: readonly ConnectionInputs[], cash: readonly {connectionId:string;accountId:string;currency:string;amount:string;observedAt:string}[]=[]): LedgerReadModel['reconciliation'] {
  const rows: ReconciliationRow[]=[]; const dates:string[]=[]
  for (const input of inputs) {
    const snapshots=[...input.holdingsHistory].sort((a,b)=>Date.parse(a.fetchedAt)-Date.parse(b.fetchedAt))
    if (snapshots.length<2) continue
    const first=snapshots[0],last=snapshots.at(-1)!
    if (first.fetchedAt===last.fetchedAt) continue
    dates.push(first.fetchedAt,last.fetchedAt)
    const period=events.filter(e=>e.connectionId===input.connection.id && e.occurredAt && Date.parse(e.occurredAt)>Date.parse(first.fetchedAt)&&Date.parse(e.occurredAt)<=Date.parse(last.fetchedAt))
    const keys=new Map([...first.positions,...last.positions].map(p=>[JSON.stringify([p.account,p.isin]),p]))
    for (const e of period) for(const leg of e.securities) if(leg.accountId) keys.set(JSON.stringify([leg.accountId,leg.isin]),{account:leg.accountId,isin:leg.isin} as typeof first.positions[number])
    for(const {account,isin} of keys.values()) {
      const opening=first.positions.find(p=>p.account===account&&p.isin===isin)?.quantity ?? '0'
      const closing=last.positions.find(p=>p.account===account&&p.isin===isin)?.quantity ?? '0'
      const movement=sum(period.filter(e=>e.status==='executed').flatMap(e=>e.securities.filter(s=>s.accountId===account&&s.isin===isin).map(s=>s.quantity)))
      const expected=new D(opening).add(movement).toFixed(),difference=new D(closing).sub(expected).toFixed()
      rows.push({connectionId:input.connection.id,accountId:account,unit:isin,openingAt:first.fetchedAt,closingAt:last.fetchedAt,opening,movement,expected,closing,difference,state:new D(difference).isZero()?'matched-with-gaps':'difference',gaps:['Statement-period completeness is unverified.',...(period.some(e=>!e.accountId||e.status==='unresolved'||e.gaps.length)?['Unresolved events or source precision may affect this period.']:[])]})
    }
  }
  for(const key of new Set(cash.map(c=>JSON.stringify([c.connectionId,c.accountId,c.currency])))) {
    const [connectionId,accountId,currency]=JSON.parse(key) as string[]
    const matches=cash.filter(c=>c.connectionId===connectionId&&c.accountId===accountId&&c.currency===currency).sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt))
    const first=matches[0],last=matches.at(-1)!
    if(first.observedAt===last.observedAt)continue
    const period=events.filter(e=>e.connectionId===connectionId&&e.accountId===accountId&&e.status==='executed'&&(e.settlementAt??e.occurredAt)&&Date.parse((e.settlementAt??e.occurredAt)!)>Date.parse(first.observedAt)&&Date.parse((e.settlementAt??e.occurredAt)!)<=Date.parse(last.observedAt))
    const movement=sum(period.flatMap(e=>e.cash.filter(c=>c.currency===currency).map(c=>c.amount)))
    const expected=new D(first.amount).add(movement).toFixed(),difference=new D(last.amount).sub(expected).toFixed()
    dates.push(first.observedAt,last.observedAt)
    rows.push({connectionId,accountId,unit:currency,openingAt:first.observedAt,closingAt:last.observedAt,opening:first.amount,closing:last.amount,movement,expected,difference,state:new D(difference).isZero()?'matched-with-gaps':'difference',gaps:['Statement-period completeness is unverified.',...(period.some(e=>!e.settlementAt)?['Settlement timestamps are missing; reported event times may cross cash boundaries.']:[])]})
  }
  return {from:dates.sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null,to:dates.at(-1)??null,rows,gaps:[...(rows.some(r=>/^[A-Z]{3}$/.test(r.unit))?[]:['Cash reconciliation needs two dated account-scoped balances. Acquire another observation; no missing balance is assumed to be zero.']),...(rows.length?[]:['Two distinct holdings observations are needed for quantity reconciliation.'])]}
}
