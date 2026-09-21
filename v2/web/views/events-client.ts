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
export interface EventsClient { read(signal:AbortSignal):Promise<LedgerReadModel>; backfill(signal:AbortSignal):Promise<void> }
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
    },
  }
}
