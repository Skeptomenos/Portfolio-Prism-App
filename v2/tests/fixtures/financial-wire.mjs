// Synthetic browser fixtures only. Complete required wire fields explicitly;
// production clients have no defaults or legacy fallback.
export function financialEnvelope(resource, input) {
  let data = input
  if (resource === 'overview') data = { rows: [], totals: [], pricedCount: 0, zeroCount: 0, missingCount: 0, holdingsAt: null, quoteRetrievedAt: null, ...input,
    rows: (input?.rows ?? []).map(row => ({ quantityObservedAt: row.quoteAt ?? null, valuationStatus: row.value === null ? 'unavailable' : 'priced', ...row })) }
  if (resource === 'coverage' && input === null) data = { totals: [], pricedCount: 0, unvalued: 0, zeroCount: 0,
    positionCount: 0, companyGrouping: 'unavailable', reconciliation: 'pending', holdingsAt: null,
    quoteDates: { earliest: null, latest: null }, compositionDates: { earliest: null, latest: null },
    staleQuotes: 0, staleCompositions: 0, refreshFailed: false, warning: null,
    counts: { held: 0, saved: 0, checked: 0, used: 0, underlyingOnly: 0 }, funds: [], gaps: [] }
  if (resource === 'exposure') {
    const source = value => value ? { parserVersion: 1, weightUnit: 'percent', scope: 'top-ten', ...value,
      ...(value.sourceAccounting ? { sourceAccounting: { validEquityIsins: 0, equityPercent: '0', marketValue: '0', notionalValue: '0', ...value.sourceAccounting,
        byAssetClass: value.sourceAccounting.byAssetClass.map(item => ({ marketValue: '0', notionalValue: '0', ...item })) } } : {}) } : null
    data = { rows: [], issuerGroups: [], coverage: [], gaps: [], composition: null, compositions: [], attempt: null, refreshing: false,
      pilotOwned: false, holdingsAt: null, missingValuations: 0, directStockCoverage: [], stale: false, refreshFailed: false,
      warning: null, sourceAttempts: {}, issuerRefresh: { active: false, automatic: false, currentFundIsin: null, attempts: {}, warning: null }, ...input,
      composition: source(input?.composition), compositions: (input?.compositions ?? (input?.composition ? [input.composition] : [])).map(source),
      gaps: (input?.gaps ?? []).map(item => ({ account: 'synthetic', sourceDetail: null, ...item })) }
  }
  return { contractVersion: 'portfolio-financial/1', resource, snapshot: { kind: 'live-projection', id: 'a'.repeat(64) }, data }
}
export function financialFulfill(route, options) {
  const match = /\/api\/financial\/(overview|exposure|coverage|development)/.exec(route.request().url())
  return route.fulfill(match && (!options.status || options.status === 200) ? { ...options, json: financialEnvelope(match[1], options.json) } : options)
}
