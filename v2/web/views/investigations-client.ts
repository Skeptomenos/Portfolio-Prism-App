import { Schema } from 'effect'
import {
  InvestigationCommandSchema,
  ManualEvidenceSchema,
  ScopeSchema,
  decodeInvestigationCommand,
  type InvestigationCommand,
  type ManualEvidence,
  type Scope,
} from '../../contracts/investigations'

export type { ManualEvidence }

export type InvestigationScope = Scope

export type InvestigationItem = {
  scope: InvestigationScope
  name: string
  state: 'open' | 'excluded'
  reason: string
  value: string | null
  currency: string | null
  manualStatus: string
  manualEvidence: ManualEvidence | null
  evidence: ManualEvidence[]
  manualAllowed: boolean
  allowedCurrencies: string[]
  quantityObservedAt: string | null
  decisionAt: string | null
  brokerValue: string | null
  brokerReason: string
}

export type InvestigationsResult = {
  items: InvestigationItem[]
  counts: { open: number; excluded: number; manualSupported: number }
}

export type InvestigationAction = InvestigationCommand

const InvestigationItemSchema = Schema.Struct({
  scope: ScopeSchema,
  name: Schema.String,
  state: Schema.Literal('open', 'excluded'),
  reason: Schema.String,
  value: Schema.NullOr(Schema.String),
  currency: Schema.NullOr(Schema.String),
  manualStatus: Schema.String,
  manualEvidence: Schema.NullOr(ManualEvidenceSchema),
  evidence: Schema.Array(ManualEvidenceSchema),
  manualAllowed: Schema.Boolean,
  allowedCurrencies: Schema.Array(Schema.String),
  quantityObservedAt: Schema.NullOr(Schema.String),
  decisionAt: Schema.NullOr(Schema.String),
  brokerValue: Schema.NullOr(Schema.String),
  brokerReason: Schema.String,
})
const InvestigationsResultSchema = Schema.Struct({
  items: Schema.Array(InvestigationItemSchema),
  counts: Schema.Struct({ open: Schema.Number, excluded: Schema.Number, manualSupported: Schema.Number }),
})

export function createInvestigationsClient(request: typeof fetch = fetch) {
  return {
    async read(signal?: AbortSignal): Promise<InvestigationsResult> {
      const response = await request('/api/investigations', {
        signal,
        credentials: 'same-origin',
        redirect: 'error',
      })
      if (!response.ok) throw new Error('Investigations could not load')
      return Schema.decodeUnknownSync(InvestigationsResultSchema)(await response.json()) as InvestigationsResult
    },
    async act(body: InvestigationAction, signal?: AbortSignal): Promise<void> {
      const command = decodeInvestigationCommand(body)
      const response = await request('/api/investigations', {
        method: 'POST',
        signal,
        credentials: 'same-origin',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Prism-Client': '1' },
        body: JSON.stringify(command),
      })
      if (!response.ok) {
        let message = 'Investigation action could not be saved'
        try {
          const payload = await response.json() as { error?: unknown }
          if (typeof payload.error === 'string' && payload.error.length <= 500) message = payload.error
        } catch { /* retain the safe fallback */ }
        throw new Error(message)
      }
    },
  }
}

export type InvestigationsClient = ReturnType<typeof createInvestigationsClient>
