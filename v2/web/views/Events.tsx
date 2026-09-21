import React, { useEffect, useRef, useState } from 'react'
import type { LedgerReadModel } from '../../contracts/events'
import type { EventsClient } from './events-client'
import { coverageMoney } from '../CoverageSummary'
const label=(v:string)=>v.replace(/-/g,' ')
export function Events({client}:{client:EventsClient}){
  const [model,setModel]=useState<LedgerReadModel|null>(null),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0)
  const [filter,setFilter]=useState('all'),[limit,setLimit]=useState(50),[pending,setPending]=useState(false),[message,setMessage]=useState<string|null>(null)
  const operation=useRef<AbortController|null>(null)
  useEffect(()=>{setPending(false);return()=>{operation.current?.abort();operation.current=null}},[client])
  useEffect(()=>{
    const controller=new AbortController()
    client.read(controller.signal).then(value=>{if(!controller.signal.aborted){setModel(value);setMessage(previous=>previous?.replace('Reloading saved results…','Saved results reloaded.')??null)}}).catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Events unavailable.');setMessage(previous=>previous?.replace('Reloading saved results…','Saved results could not be reloaded.')??null)}})
    return()=>controller.abort()
  },[client,revision])
  const backfill=async(reprocess=false)=>{
    if(operation.current)return
    const controller=new AbortController();operation.current=controller
    setPending(true);setError(null);setMessage(reprocess?'Reprocessing retained events without broker acquisition…':'Reading one bounded history batch…')
    try{
      const attemptId=await (reprocess?client.reprocess(controller.signal):client.backfill(controller.signal))
      const outcome=await client.completion(attemptId,controller.signal)
      const operationLabel=reprocess?'Retained event reprocessing':'History batch'
      const provenance=reprocess?' Source dates and coverage are unchanged; no new acquisition.':''
      if(!controller.signal.aborted)setMessage(`${operationLabel} ${outcome==='succeeded'?'completed':outcome==='partial'?'finished with partial results':outcome==='cancelled'?'cancelled':'failed'}. Reloading saved results…${provenance} ${outcome==='failed'?'Check Connection & sync for the cause and retry path.':'Remaining gaps are shown below.'}`)
    }catch(e){if(!controller.signal.aborted){setMessage(null);setError(e instanceof Error?e.message:'History batch failed.')}}finally{
      if(!controller.signal.aborted){setRevision(n=>n+1);setPending(false)}
      if(operation.current===controller)operation.current=null
    }
  }
  const events=model?.events.filter(e=>filter==='all'||e.status===filter)??[]
  return <div className="events-view">
    <section className="panel">
      <div className="section-title"><h2>Transactions & cash movements</h2><span className="badge">Evidence in progress</span></div>
      <p>Executed events explain reported activity. Missing history, details and account links remain gaps. These totals are not investment gains or returns.</p>
      <div className="actions"><button disabled={pending} onClick={()=>{setMessage(null);setError(null);setRevision(n=>n+1)}}>Reload saved events</button><button disabled={pending} onClick={()=>void backfill()}>{pending?'Reading history…':'Continue primary history'}</button><button disabled={pending||!model?.events.length} onClick={()=>void backfill(true)}>Reprocess retained events</button><a href="#/portfolio">Connection & sync</a></div>
      <p className="muted">Continuation reads one timeline page and up to 20 details. Normal portfolio sync checks recent events. Reprocessing applies current supported interpretation to saved evidence, without connecting or acquiring data. Retained source dates and gaps remain below.</p>
      {message&&<p role="status">{message}</p>}{error&&<p className="notice error" role="alert">{error}</p>}
      {!model&&!error&&<p role="status">Loading saved events…</p>}
      {model&&<><p><strong>{model.events.length} saved events</strong> · {model.events.filter(e=>e.status==='executed').length} executed · {model.events.filter(e=>e.status==='unresolved').length} unresolved · {model.events.filter(e=>e.status==='non-economic').length} without booked effects</p>
        {model.gaps.map(g=><p className="notice warning" key={g}>{g}</p>)}
        {model.connections.map(c=><p key={c.id}><strong>{c.providerId}</strong> · {c.coverage?`${c.coverage.acquisition} acquisition · ${c.coverage.detailsPending} details missing · ${c.coverage.failedDetails} failed · older pages ${c.coverage.olderAvailable===null?'unknown':c.coverage.olderAvailable?'remain':'exhausted'}`:'No event evidence'} · Statement completeness unverified{c.coverage&&<><br/>Timeline last successfully read: {c.coverage.timelineObservedAt??'never'} · Latest attempt: {c.coverage.lastAttemptAt??'unknown'}</>}</p>)}
      </>}
    </section>
    {model&&<>
      <section className="panel"><h2>Observed movements · all loaded history</h2><p>Cash added and withdrawn can include internal transfers. Only explicitly paired transfers are excluded. Net cash already includes displayed fees and taxes where confirmed.</p>
        {model.totals.length===0?<p>No supported cash movements yet. Missing amounts are unknown.</p>:<div className="history-currencies">{model.totals.map(t=><article className="history-currency" key={t.currency}><h3>{t.currency}</h3><dl className="history-facts">
          {([['Net purchase cash',t.purchases],['Net sale cash',t.sales],['Cash added',t.cashAdded],['Cash withdrawn',t.cashWithdrawn],['Income received',t.income],['Card spending',t.spending],['Net observed cash movement',t.netCashMovement]] as const).map(([name,value])=><div key={name}><dt>{name}</dt><dd title={`${value} ${t.currency}`}>{coverageMoney(value,t.currency)}</dd></div>)}
          <div><dt>Paired internal transfers</dt><dd>{t.internalTransfers}</dd></div>
        </dl></article>)}</div>}
      </section>
      <section className="panel"><div className="section-title"><h2>Saved events</h2><label>Show <select value={filter} onChange={e=>{setFilter(e.target.value);setLimit(50)}}><option value="all">All activity</option><option value="executed">Executed</option><option value="unresolved">Unresolved</option><option value="non-economic">No booked effects</option></select></label></div>
        {!events.length&&<p>No events match this filter.</p>}
        <div className="history-positions">{events.slice(0,limit).map(e=><article className="history-position" key={`${e.connectionId}-${e.sourceId}`}>
          <h3>{label(e.kind)} <span className="badge">{label(e.status)}</span></h3><p>{e.occurredAt??'Source date unknown'}</p>
          {!e.cash.length&&e.reportedCash&&<p>Source-reported amount: {coverageMoney(e.reportedCash.amount,e.reportedCash.currency)} · not booked</p>}
          <p>{e.cash.length?e.cash.map((c,i)=><strong key={i}>{coverageMoney(c.amount,c.currency)} </strong>):'No supported cash leg'}</p>
          {e.securities.map((s,i)=><p className="mono" key={i}>{s.quantity} · {s.isin} · {label(s.precision)}</p>)}
          <details><summary>Evidence, exact values & {e.gaps.length} gaps</summary>
            <p className="mono">{e.sourceType} · {e.sourceId}</p><p>Observed {e.observedAt} · {e.revisionCount} retained revisions · {e.parserVersion}</p>
            <p>Cash account {e.accountId??'unknown'} · Connection {e.connectionId}</p>
            {e.cash.map((c,i)=><p key={i}>Exact net cash: {c.amount} {c.currency}</p>)}
            <p>Gross cash basis: {e.gross?`${e.gross.amount} ${e.gross.currency}`:'unknown'}</p>
            <p>Fee {e.fee??'unknown'} · Tax {e.tax??'unknown'} · {e.componentsCurrency??'currency unknown'} · {e.componentsIncludedInCash?'Components included in net cash':'Component relationship unverified'}</p>
            <p>Trade date {e.tradeAt??'unknown'} · Settlement {e.settlementAt??'unknown'}</p>
            {e.gaps.map(g=><p className="notice warning" key={g}>{g}</p>)}
          </details>
        </article>)}</div>
        {events.length>limit&&<button onClick={()=>setLimit(n=>n+50)}>Show 50 more ({events.length-limit} remaining)</button>}
      </section>
      <section className="panel"><h2>Reconciliation with saved observations</h2><p>Opening balance + evidenced movement = expected closing balance. A matching amount alone does not prove a complete period. Each row retains its own dates.</p>
        {model.reconciliation.gaps.map(g=><p className="notice warning" key={g}>{g}</p>)}
        <div className="history-positions">{model.reconciliation.rows.map((r,i)=><article className="history-position" key={i}><h3>{r.unit} <span className="badge">{label(r.state)}</span></h3><p>{r.openingAt} → {r.closingAt}</p><p className="mono">{r.opening} + ({r.movement}) = {r.expected}</p><p>Observed closing: {r.closing} · Difference: <strong>{r.difference}</strong></p><details><summary>Scope & gaps</summary><p>Connection {r.connectionId} · Account {r.accountId}</p>{r.gaps.map(g=><p key={g}>{g}</p>)}</details></article>)}</div>
      </section>
    </>}
  </div>
}
