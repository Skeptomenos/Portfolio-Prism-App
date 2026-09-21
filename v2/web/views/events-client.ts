import { Schema } from 'effect'
import { EventCoverageSchema, EventSchema, ledgerContractVersion, type LedgerReadModel } from '../../contracts/events'
const text=Schema.String,nullable=Schema.NullOr(text),decimal=text.pipe(Schema.pattern(/^-?\d+(?:\.\d+)?$/)),count=Schema.Number.pipe(Schema.int(),Schema.nonNegative())
const model=Schema.Struct({
  contractVersion:Schema.Literal(ledgerContractVersion),
  events:Schema.Array(Schema.extend(EventSchema,Schema.Struct({connectionId:text,providerId:text,versionId:count,revisionCount:count,observedAt:text}))),
  connections:Schema.Array(Schema.Struct({id:text,providerId:text,coverage:Schema.NullOr(EventCoverageSchema)})),
  totals:Schema.Array(Schema.Struct({currency:text,purchases:decimal,sales:decimal,cashAdded:decimal,cashWithdrawn:decimal,income:decimal,spending:decimal,internalTransfers:count,netCashMovement:decimal})),
  reconciliation:Schema.Struct({from:nullable,to:nullable,gaps:Schema.Array(text),rows:Schema.Array(Schema.Struct({connectionId:text,accountId:text,unit:text,openingAt:text,closingAt:text,opening:decimal,movement:decimal,expected:decimal,closing:decimal,difference:decimal,state:Schema.Literal('matched-with-gaps','difference','reconciled'),gaps:Schema.Array(text)}))}),
  gaps:Schema.Array(text),
})
export interface EventsClient { read(signal:AbortSignal):Promise<LedgerReadModel>; backfill(signal:AbortSignal):Promise<string>; completion(attemptId:string,signal:AbortSignal):Promise<string> }
export function createEventsClient(request:typeof fetch=fetch):EventsClient {
  return {
    async read(signal){
      const response=await request('/api/events',{signal,headers:{Accept:'application/json'}})
      if(!response.ok)throw Error('Saved events are unavailable. Check the local service and retry.')
      try{return Schema.decodeUnknownSync(model)(await response.json())}catch{throw Error('The event response is incompatible. Saved portfolio data is unchanged.')}
    },
    async backfill(signal){
      const response=await request('/api/events/backfill',{method:'POST',signal,headers:{'Content-Type':'application/json','X-Prism-Client':'1'},body:'{}'})
      if(!response.ok)throw Error('Could not start a history batch. Connect on Portfolio and wait for any current operation to finish.')
      try{
        const body=Schema.decodeUnknownSync(Schema.Struct({accepted:Schema.Literal(true),attemptId:Schema.String.pipe(Schema.minLength(1))}))(await response.json())
        return body.attemptId
      }catch{throw Error('The history batch was accepted, but its completion reference is unavailable. Check Connection & sync before retrying.')}
    },
    async completion(attemptId,signal){
      const diagnostic=Schema.Struct({attemptId:text,event:Schema.Literal('started','succeeded','partial','failed','cancelled'),terminal:Schema.optional(Schema.Boolean)})
      // The server caps operations at three minutes. Observe one request at a time,
      // at most once per second; stop locally after a bounded grace period.
      const deadline=Date.now()+190_000
      for(let i=0;i<190&&Date.now()<deadline;i++){
        signal.throwIfAborted()
        const response=await request('/api/diagnostics',{signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),headers:{Accept:'application/json'}})
        if(!response.ok)throw Error('Completion status is unavailable. Reload saved events or check Connection & sync.')
        const body=Schema.decodeUnknownSync(Schema.Struct({events:Schema.Array(diagnostic)}))(await response.json())
        const terminal=body.events.find(d=>d.attemptId===attemptId&&d.terminal)
        if(terminal)return terminal.event
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(timer);reject(signal.reason)}
          const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},1000)
          signal.addEventListener('abort',abort,{once:true})
          if(signal.aborted)abort()
        })
      }
      throw Error('Completion is not confirmed. Check Connection & sync before retrying.')
    },
  }
}
