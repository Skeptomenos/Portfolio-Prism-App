// Shared H1 wire contract. Endpoints are planned, not implemented by this file.
// Decimal quantities/amounts are strings; null is unknown, never an implied zero.
export const historyContractVersion = 'portfolio-history/1' as const

export interface HistoryAccountRef {
  connectionId: string
  accountId: string
}

export interface HistoryNotice {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  nextAction: string | null
  diagnosticId: string | null
}

export interface HistoryDateRange {
  min: string | null
  max: string | null
}

export interface HistoryCurrencySummary {
  currency: string
  pricedSecurities: string
  includedSecurityValue: string
  unassignedValue: string
  nonCompanyValue: string | null
  coveragePercent: string | null
  allocationState: 'allocated' | 'partial' | 'unavailable' | 'incompatible'
  // Cash is separate from the priced-securities allocation denominator.
  cashValue: string | null
  cashState: 'known' | 'partial' | 'unknown'
}

export interface HistoryCheckpointSummary {
  id: string
  runId: string
  recordedAt: string
  reason: 'holdings' | 'valuation' | 'composition' | 'migration' | 'manual-evidence'
  datasetId: string
  accounts: readonly HistoryAccountRef[]
  holdingsObservedAt: string | null
  quoteDates: HistoryDateRange
  compositionDates: HistoryDateRange
  currencies: readonly HistoryCurrencySummary[]
  pricedPositionCount: number
  unvaluedPositionCount: number
  zeroPositionCount: number
  // Valuation completeness says nothing about complete company exposure.
  valuationState: 'valued' | 'partial' | 'unavailable' | 'empty'
  companyGrouping: 'partial' | 'unavailable'
  reconciliation: 'pending'
  notices: readonly HistoryNotice[]
}

export interface HistoryRunSummary {
  id: string
  trigger: 'broker-sync' | 'composition-refresh' | 'migration' | 'manual-evidence'
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'interrupted'
  checkpointCount: number
  latestCheckpoint: HistoryCheckpointSummary | null
  notices: readonly HistoryNotice[]
}

export interface HistoryRunsPage {
  contractVersion: typeof historyContractVersion
  items: readonly HistoryRunSummary[]
  nextCursor: string | null
}

export interface HistoryRunDetail {
  contractVersion: typeof historyContractVersion
  run: HistoryRunSummary
  checkpoints: readonly HistoryCheckpointSummary[]
}

export interface HistoryPosition {
  account: HistoryAccountRef
  isin: string
  name: string
  quantity: string
  currency: string | null
  unitPrice: string | null
  value: string | null
  quoteAt: string | null
  valuationStatus: 'priced' | 'zero' | 'unsupported-negative' | 'unavailable'
  quality: string
}

export interface HistoryInputReference {
  id: string
  kind: 'holdings' | 'quote' | 'cash' | 'instrument' | 'composition' | 'identity' | 'policy'
  sourceId: string
  asOf: string | null
  observedAt: string | null
  sha256: string | null
  parserVersion: string | null
}

export interface HistoryCheckpointDetail {
  contractVersion: typeof historyContractVersion
  checkpoint: HistoryCheckpointSummary
  positions: readonly HistoryPosition[]
  inputs: readonly HistoryInputReference[]
  versions: Readonly<Record<string, string>>
  replay: { state: 'available' | 'unavailable'; reason: string | null }
}
