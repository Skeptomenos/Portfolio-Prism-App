import type { FinancialObservation as RetainedFinancialObservation } from './history-observation'
import { createHash } from 'node:crypto'
import { Decimal } from 'decimal.js'
import type { LedgerEvent } from '../contracts/events'
import type { BrokerEventBatch } from './broker-events'
import { sanitizePayload, type DataSource, type Json } from './explorer'
import { eventHash } from './event-ledger'

const D = Decimal.clone({ precision: 256 })
const rec = (x: unknown): Record<string, unknown> => x && typeof x==='object' && !Array.isArray(x) ? x as Record<string,unknown> : {}
const arr = (x: unknown): unknown[] => Array.isArray(x)?x:[]
const str = (x: unknown) => typeof x==='string'?x:null
const account = (x: unknown) => typeof x==='string'&&x.length>0 ? createHash('sha256').update(x).digest('hex').slice(0,16):null
const iso = (x: unknown) => typeof x==='string' && /^\d{4}-\d{2}-\d{2}T/.test(x)&&/(?:Z|[+-]\d{2}:?\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))?x:null
const isin = (x: unknown) => typeof x==='string'&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(x)?x:null
const labels = new Set(['Event','Shares','Transaction','Fee','Tax','Total','Dividend per share','Price','Quantity','Gross amount','Settlement date','Execution date','Round up','Accrued'])
const plain = (x: unknown) => typeof x==='string'&&/^-?\d+(?:\.\d+)?$/.test(x)&&x.length<=128?new D(x).toFixed():null
/** Only the observed English displayValue format is admitted. Localized strings,
 * unknown symbols, ambiguous grouping and display prefixes are not guessed. */
function money(x: unknown, currency: string): string | null {
  if(typeof x!=='string')return null
  const symbol=currency==='EUR'?'€':currency==='USD'?'$':currency==='GBP'?'£':null
  if(!symbol)return null
  const compact=x.replace(/\s/g,'')
  const pattern=new RegExp(`^([+-]?)\\${symbol}(\\d+(?:,\\d{3})*(?:\\.\\d+)?)$`)
  const m=pattern.exec(compact)
  return m?new D(`${m[1]}${m[2].replace(/,/g,'')}`).toFixed():null
}
function majorAmount(value: unknown): { amount: string; currency: string } | null {
  const a=rec(value)
  if(typeof a.currency!=='string'||! /^[A-Z]{3}$/.test(a.currency)||typeof a.fractionDigits!=='number'||!Number.isInteger(a.fractionDigits)||a.fractionDigits<0||a.fractionDigits>8)return null
  if(typeof a.value!=='number'||!Number.isFinite(a.value))return null
  const amount=new D(String(a.value)),scaled=amount.mul(new D(10).pow(a.fractionDigits))
  if(!scaled.isInteger()||scaled.abs().gt(Number.MAX_SAFE_INTEGER))return null
  return {amount:amount.toFixed(),currency:a.currency}
}
function financialDetail(value: unknown) {
  const detail=rec(value),sections=arr(detail.sections).map(rec)
  const headers=sections.filter(s=>s.type==='header')
  const rows=sections.filter(s=>s.type==='table').flatMap(s=>arr(s.data).map(rec)).filter(r=>labels.has(String(r.title))).map(r=>{
    const d=rec(r.detail),display=rec(d.displayValue)
    return {label:String(r.title),text:str(d.text),display:str(display.text),prefix:str(display.prefix),functionalStyle:str(d.functionalStyle)}
  })
  return {id:str(detail.id),status:str(rec(headers[0]?.data).status),isin:isin(rec(headers[0]?.action).type==='instrumentDetail'?rec(headers[0]?.action).payload:null),rows}
}
export function tradeRepublicEvents(sources: readonly DataSource[], retainedCash: readonly RetainedFinancialObservation[]=[]): BrokerEventBatch | null {
  const history=sources.find(s=>s.id==='timelineTransactions'),details=sources.find(s=>s.id==='timelineDetails')
  if(!history?.payload||!history.fetchedAt)return null
  const h=rec(history.payload),d=rec(details?.payload)
  const detailItems=arr(d.items).map(rec), byId=new Map(detailItems.map(r=>[r.id,r]))
  const detailCounts=new Map<unknown,number>()
  for(const row of detailItems)detailCounts.set(row.id,(detailCounts.get(row.id)??0)+1)
  const pairs=sources.find(s=>s.id==='accountPairs')
  const links=arr(rec(pairs?.payload).accounts).map(rec).map(p=>({cash:account(p.cashAccountNumber),security:account(p.securitiesAccountNumber),observedAt:pairs?.fetchedAt??null}))
  const duplicates=new Set<string>(),seen=new Set<string>()
  for(const item of arr(h.items)){const id=str(rec(item).id);if(id){if(seen.has(id))duplicates.add(id);seen.add(id)}}
  const events=arr(h.items).map(rec).filter(item=>typeof item.id==='string').filter((item,index,all)=>all.findIndex(x=>x.id===item.id)===index).map(item=>{
    const cashAccount=account(item.cashAccountNumber),matches=links.filter(l=>l.cash===cashAccount&&l.cash&&l.security)
    const securityAccount=matches.length===1?matches[0].security:null
    const candidate=byId.get(item.id)
    const detailMatches=candidate?.timelineFingerprint ? candidate.timelineFingerprint===eventHash(sanitizePayload(item)) : !!details?.fetchedAt && details.fetchedAt >= history.fetchedAt!
    const rawDetail=financialDetail(candidate?.response)
    const ambiguousDetail=(detailCounts.get(item.id)??0)>1
    const mismatchedDetail=!!candidate?.response&&rawDetail.id!==item.id
    const saved=detailMatches&&!ambiguousDetail&&!mismatchedDetail?candidate:undefined
    const detail=financialDetail(saved?.response),amount=majorAmount(item.amount)
    const evidence=sanitizePayload({event:{id:item.id,eventType:item.eventType,status:item.status,timestamp:item.timestamp,subtitle:item.subtitle,amount:item.amount,cashAccount,hidden:item.hidden,deleted:item.deleted},detail:rawDetail,detailIdentity:ambiguousDetail?'ambiguous':mismatchedDetail?'mismatch':'matched',accountLink:matches.length===1?matches[0]:null})
    const event: { -readonly [K in keyof LedgerEvent]: LedgerEvent[K] }={sourceId:String(item.id),sourceType:str(item.eventType)??'unknown',accountId:cashAccount,occurredAt:iso(item.timestamp),tradeAt:null,settlementAt:null,status:'unresolved',kind:'unknown',reportedCash:amount,cash:[],securities:[],gross:null,fee:null,tax:null,componentsCurrency:amount?.currency??null,componentsIncludedInCash:false,transferReference:null,reversesSourceId:null,gaps:[],evidenceHash:eventHash(evidence),parserVersion:'trade-republic-events/2'}
    const gaps:string[]=[]
    if(ambiguousDetail)gaps.push('Duplicate detail identities are ambiguous; details are not admitted.')
    if(mismatchedDetail)gaps.push('Detail response identity is missing or does not match this event; details are not admitted.')
    if(!cashAccount)gaps.push('Cash account is not identified by this event.')
    if(!event.occurredAt)gaps.push('The source timestamp is missing or has no explicit timezone.')
    if(duplicates.has(event.sourceId))gaps.push('Conflicting duplicate source identity needs review.')
    const inactive=item.deleted===true || ['CANCELED','CANCELLED','FAILED','PENDING'].includes(String(item.status)) || item.eventType==='TRADING_SAVINGSPLAN_EXECUTION_FAILED'||item.eventType==='CARD_VERIFICATION'
    if(inactive)return {event:{...event,status:'non-economic' as const,gaps},evidence}
    if(item.status!=='EXECUTED'||duplicates.has(event.sourceId)||!event.occurredAt||!amount)return {event:{...event,gaps:[...gaps,'Execution status, timestamp or exact source amount is unsupported.']},evidence}
    if(detail.status&&detail.status!=='executed')return {event:{...event,gaps:[...gaps,'Event and detail execution status disagree.']},evidence}
    const row=(label:string)=>{const r=detail.rows.filter(r=>r.label===label);return r.length===1?r[0]:null}
    const value=(label:string)=>row(label)?.display??row(label)?.text
    let kind:LedgerEvent['kind']='unknown'
    if(item.eventType==='SPARE_CHANGE_AGGREGATE'){
      const transaction=row('Transaction'),quantity=plain(/^(\d+(?:\.\d+)?)\s*[×x]\s*/.exec(transaction?.prefix??transaction?.text??'')?.[1])
      const total=money(value('Total'),amount.currency),accrued=money(value('Accrued'),amount.currency)
      if(item.subtitle==='Round up'&&detail.status==='executed'&&value('Round up')==='Completed'&&row('Round up')?.functionalStyle==='EXECUTED'&&detail.isin&&quantity&&new D(quantity).gt(0)&&total!==null&&accrued!==null&&new D(total).eq(new D(amount.amount).neg())&&new D(accrued).eq(total))kind='buy'
    }
    if(item.eventType==='TRADING_SAVINGSPLAN_EXECUTED')kind='buy'
    if(item.eventType==='TRADING_TRADE_EXECUTED'){
      if(['Buy Order','Limit Buy'].includes(String(item.subtitle)))kind='buy'
      if(['Sell Order','Limit Sell'].includes(String(item.subtitle)))kind='sell'
    }
    if(item.eventType==='BANK_TRANSACTION_INCOMING')kind='deposit'
    if(item.eventType==='BANK_TRANSACTION_OUTGOING')kind='withdrawal'
    if(item.eventType==='CARD_TRANSACTION')kind='card-payment'
    if(item.eventType==='CARD_REFUND')kind='card-refund'
    if(item.eventType==='INTEREST_PAYOUT')kind='interest'
    if(item.eventType==='SSP_CORPORATE_ACTION_CASH')kind=value('Event')==='Cash dividend'?'dividend':'corporate-action'
    if(kind==='unknown')return {event:{...event,gaps:[...gaps,'This event type or economic meaning is not yet supported.']},evidence}
    const negative=['buy','withdrawal','card-payment'].includes(kind)
    if(kind!=='corporate-action'&&(negative?new D(amount.amount).gte(0):new D(amount.amount).lt(0)))return {event:{...event,kind,gaps:[...gaps,'The source cash sign disagrees with the supported event type.']},evidence}
    const total=money(value('Total'),amount.currency)
    if(total!==null&&!new D(total).abs().eq(new D(amount.amount).abs()))return {event:{...event,kind,gaps:[...gaps,'Detail total and timeline amount disagree.']},evidence}
    if(kind==='corporate-action')gaps.push('Corporate-action cash is reported; its income or capital classification is unresolved.')
    event.status='executed';event.kind=kind;event.cash=[{currency:amount.currency,amount:amount.amount}]
    if(saved?.response&&saved.error)gaps.push('Detail refresh failed; the compatible prior detail is retained.')
    if(!saved?.response)gaps.push(saved?.error?'Detail acquisition failed. Retry a bounded batch.':'Event detail has not been acquired.')
    if(['buy','sell'].includes(kind)){
      const transaction=row('Transaction'),prefix=transaction?.prefix??transaction?.text??''
      const q=/^(\d+(?:\.\d+)?)\s*[×x]\s*/.exec(prefix)?.[1]
      const quantity=plain(q)
      if(quantity&&detail.isin&&new D(quantity).gt(0))event.securities=[{accountId:securityAccount,isin:detail.isin,quantity:new D(quantity).mul(kind==='sell'?-1:1).toFixed(),precision:'reported-display'}]
      else gaps.push('Executed cash is known; instrument or reported trade quantity is unavailable.')
      if(!securityAccount)gaps.push('No explicit cash-to-securities account link is retained.')
      gaps.push('Share quantity is reported display precision; exact settlement quantity is not established.')
    }
    const component=(label:string)=>value(label)==='Free'?'0':money(value(label),amount.currency)
    event.fee=component('Fee');event.tax=component('Tax');event.componentsIncludedInCash=total!==null
    if(event.fee!==null&&event.tax!==null){
      if(total!==null)event.gross={currency:amount.currency,amount:new D(amount.amount).add(new D(event.fee??'0').abs()).add(new D(event.tax??'0').abs()).toFixed()}
    }
    gaps.push('Trade and settlement timestamps are not separately evidenced.')
    if(['deposit','withdrawal'].includes(kind))gaps.push('External versus internal transfer scope is unverified; no pairing reference is exposed.')
    return {event:{...event,gaps},evidence}
  })
  const observedAt=[history.fetchedAt,details?.fetchedAt].filter((v):v is string=>!!v).sort().at(-1)!
  const failedDetails=detailItems.filter(r=>!!r.error).length
  const cashSource=sources.find(s=>s.id==='cash')
  const cashInputs=[...(cashSource?.fetchedAt?arr(cashSource.payload).map(value=>({...rec(value),observedAt:cashSource.fetchedAt})):[]),...retainedCash.filter(o=>o.observedAt).flatMap(o=>o.cash.map(c=>({accountNumber:c.accountId,currencyId:c.currency,amount:c.amount,observedAt:o.observedAt})))]
  const cashBalances=cashInputs.flatMap(value=>{
    const row=rec(value),id=account(row.accountNumber),currency=str(row.currencyId)
    const amount=typeof row.amount==='string'?plain(row.amount):typeof row.amount==='number'&&Number.isFinite(row.amount)&&Math.abs(row.amount)<=Number.MAX_SAFE_INTEGER/100?new D(String(row.amount)).toFixed():null
    return id&&currency&&/^[A-Z]{3}$/.test(currency)&&amount!==null?[{accountId:id,currency,amount,observedAt:String(row.observedAt)}]:[]
  })
  return {contractVersion:'broker-events/1',observedAt,events,cashBalances,coverage:{observedAt,timelineObservedAt:history.fetchedAt,lastAttemptAt:[history.attemptedAt,details?.attemptedAt].filter((v):v is string=>!!v).sort().at(-1)??observedAt,acquisition:history.status==='failed'||details?.status==='failed'?'failed':'partial',olderAvailable:typeof h.nextCursor==='string'?true:h.nextCursor===null?false:null,detailsPending:Math.max(0,events.length-detailItems.filter(r=>!!r.response).length),failedDetails,recentGap:!!h.recentCursor,historyComplete:false},state:sanitizePayload(sources.filter(s=>['timelineTransactions','timelineDetails','accountPairs','cash'].includes(s.id)).map(s=>s.id==='timelineDetails' && s.fetchedAt && s.fetchedAt>=history.fetchedAt! ? {...s,payload:{...rec(s.payload),items:detailItems.map(r=>({...r,timelineFingerprint:r.timelineFingerprint??eventHash(sanitizePayload(arr(h.items).find(x=>rec(x).id===r.id)??null))}))}} : s))}
}

/** A retained-state command never substitutes older explorer snapshots or contacts TR. */
export function normalizeRetainedTradeRepublicEvents(state: Json): BrokerEventBatch | null {
  if(!Array.isArray(state)||state.length===0||state.length>4)throw Error('Invalid retained event state')
  const ids=new Set<string>()
  for(const value of state){
    const source=rec(value),id=str(source.id)
    if(!id||!['timelineTransactions','timelineDetails','accountPairs','cash'].includes(id)||ids.has(id))throw Error('Invalid retained source identity')
    ids.add(id)
    if(!['success','partial','failed','not-fetched','unsupported'].includes(String(source.status)))throw Error('Invalid retained source status')
    if(source.fetchedAt!==undefined&&!iso(source.fetchedAt)||source.attemptedAt!==undefined&&!iso(source.attemptedAt))throw Error('Invalid retained source date')
    if(id==='timelineTransactions'||id==='timelineDetails'){
      if(!Array.isArray(rec(source.payload).items))throw Error('Invalid retained timeline payload')
      const seen=new Set<string>()
      for(const item of arr(rec(source.payload).items)){
        const itemId=str(rec(item).id)
        if(!itemId||seen.has(itemId))throw Error('Invalid retained item identity')
        seen.add(itemId)
      }
    }
  }
  if(!ids.has('timelineTransactions'))throw Error('Retained timeline missing')
  const batch=tradeRepublicEvents(state as unknown as DataSource[])
  return batch?{...batch,state}:null
}
