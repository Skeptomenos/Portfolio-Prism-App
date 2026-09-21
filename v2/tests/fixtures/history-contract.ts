// Synthetic contract examples only. Never expose these as live application data.
import {
  historyContractVersion,
  type HistoryCheckpointDetail,
  type HistoryCheckpointSummary,
  type HistoryRunDetail,
  type HistoryRunsPage,
} from '../../contracts/history'

const account = { connectionId: 'synthetic-broker', accountId: 'synthetic-account' }
const notice = {
  code: 'history.price-missing', severity: 'warning' as const,
  message: 'One position has no compatible valuation.',
  nextAction: 'Acquire a compatible dated quote.', diagnosticId: null,
}

export const syntheticCheckpoint: HistoryCheckpointSummary = {
  id: 'synthetic-checkpoint-1', runId: 'synthetic-run-1',
  recordedAt: '2026-01-02T12:00:02.000Z', reason: 'valuation',
  datasetId: 'synthetic-dataset', accounts: [account],
  holdingsObservedAt: '2026-01-02T12:00:00.000Z',
  quoteDates: { min: '2026-01-02T12:00:01.000Z', max: '2026-01-02T12:00:01.000Z' },
  compositionDates: { min: null, max: null },
  currencies: [{
    currency: 'EUR', pricedSecurities: '1000', includedSecurityValue: '1000',
    unassignedValue: '0', nonCompanyValue: null, coveragePercent: '100',
    allocationState: 'allocated', cashValue: '250', cashState: 'known',
  }],
  pricedPositionCount: 1, unvaluedPositionCount: 1, zeroPositionCount: 0,
  valuationState: 'partial', companyGrouping: 'partial', reconciliation: 'pending',
  notices: [notice],
}

export const syntheticHistoryPage: HistoryRunsPage = {
  contractVersion: historyContractVersion,
  items: [{
    id: 'synthetic-failed-run', trigger: 'broker-sync',
    startedAt: '2026-01-03T12:00:00.000Z', finishedAt: '2026-01-03T12:00:01.000Z',
    status: 'failed', checkpointCount: 0, latestCheckpoint: null,
    notices: [{
      code: 'history.sync-failed', severity: 'error',
      message: 'Sync failed before new holdings were saved.',
      nextAction: 'Retry portfolio sync.', diagnosticId: 'synthetic-diagnostic',
    }],
  }, {
    id: 'synthetic-run-1', trigger: 'broker-sync',
    startedAt: '2026-01-02T12:00:00.000Z', finishedAt: '2026-01-02T12:00:03.000Z',
    status: 'partial', checkpointCount: 1, latestCheckpoint: syntheticCheckpoint,
    notices: [notice],
  }],
  nextCursor: null,
}

export const syntheticRunDetail: HistoryRunDetail = {
  contractVersion: historyContractVersion,
  run: syntheticHistoryPage.items[1],
  checkpoints: [syntheticCheckpoint],
}

export const syntheticCheckpointDetail: HistoryCheckpointDetail = {
  contractVersion: historyContractVersion, checkpoint: syntheticCheckpoint,
  positions: [{
    account, isin: 'US0000000010', name: 'Synthetic priced holding', quantity: '10',
    currency: 'EUR', unitPrice: '100', value: '1000', quoteAt: '2026-01-02T12:00:01.000Z',
    valuationStatus: 'priced', quality: 'Synthetic compatible quote',
  }, {
    account, isin: 'US0000000028', name: 'Synthetic unvalued holding', quantity: '2',
    currency: null, unitPrice: null, value: null, quoteAt: null,
    valuationStatus: 'unavailable', quality: 'Missing quote or listing metadata',
  }],
  inputs: [{
    id: 'synthetic-holdings-observation', kind: 'holdings', sourceId: 'synthetic-broker',
    asOf: null, observedAt: '2026-01-02T12:00:00.000Z', sha256: null,
    parserVersion: 'synthetic/1',
  }],
  versions: { calculator: 'synthetic/1', policy: 'synthetic/1' },
  replay: { state: 'unavailable', reason: 'This is an API fixture, not a saved input bundle.' },
}
