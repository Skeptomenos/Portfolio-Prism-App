import { Schema as S } from 'effect'

/** Browser-safe presentation contracts. No provider execution or storage types. */
export const financialContractVersion = 'portfolio-financial/1' as const
const text = S.String
const nullable = S.NullOr(text)
export const DecimalText = text.pipe(S.pattern(/^-?\d+(?:\.\d+)?$/), S.maxLength(2048))
const decimal = S.NullOr(DecimalText)
const recordedDate = text.pipe(S.filter(value => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return false
  const day = value.slice(0, 10)
  return new Date(day).toISOString().slice(0, 10) === day
}))
const nullableDate = S.NullOr(recordedDate)
const publicUrl = text.pipe(S.filter(value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password } catch { return false } }))
const count = S.Number.pipe(S.int(), S.nonNegative())
const currency = text.pipe(S.pattern(/^[A-Z]{3}$/))
const unit = S.Literal('percent', 'fraction')
const dateRange = S.Struct({ earliest: nullableDate, latest: nullableDate })
const check = S.Struct({ id: text, state: S.Literal('passed', 'failed', 'pending'), detail: text, evidence: S.Array(text) })
const limitation = S.Struct({ qualifier: text, nextAction: text })
const provider = S.Struct({ id: text, version: text, contractVersion: text, policyVersion: text })
const manualEvidence = S.Struct({ id: text, source: text, reason: text, recordedAt: recordedDate, asOf: recordedDate })
export const ValuedPositionSchema = S.Struct({
  manualEvidence: S.optional(manualEvidence),
  account: text, isin: text, name: text, quantity: DecimalText, instrumentType: text, averageBuyIn: DecimalText,
  currency: S.NullOr(currency), price: decimal, value: decimal, quoteAt: nullableDate, venue: nullable, quality: text,
  weight: decimal, quantityObservedAt: nullableDate, valuationStatus: S.Literal('priced', 'zero', 'unsupported-negative', 'unavailable'),
})
export const OverviewSchema = S.Struct({
  rows: S.Array(ValuedPositionSchema), totals: S.Array(S.Struct({ currency, securities: DecimalText, cash: decimal,
    pricedCount: count, cashAt: nullableDate, cashStale: S.Boolean, olderQuotes: count })),
  pricedCount: count, zeroCount: count, missingCount: count, holdingsAt: nullableDate, quoteRetrievedAt: nullableDate,
})
const contributionSource = S.Struct({ fundIsin: text, sha256: text, asOf: nullableDate, retrievedAt: recordedDate, url: publicUrl,
  measure: text, stale: S.Boolean, parserVersion: S.optional(text), provider: S.optional(provider), estimateLimitation: S.optional(limitation) })
export const ContributionSchema = S.Struct({ manualEvidence: S.optional(manualEvidence), kind: S.Literal('direct', 'etf'), positionIsin: text,
  positionName: S.optional(text), account: text, value: decimal, positionValue: decimal, weightPercent: DecimalText,
  quoteAt: nullableDate, quality: text, source: S.optional(contributionSource) })
const security = S.Struct({ isin: text, name: text, currency: S.NullOr(currency), direct: DecimalText, indirect: DecimalText,
  knownTotal: DecimalText, percentOfPriced: decimal, contributions: S.Array(ContributionSchema) })
const accounting = S.Struct({ sourceRows: count, equityRows: count, nonEquityRows: count, validEquityIsins: count,
  unresolvedEquityRows: count, reportedPercent: DecimalText, equityPercent: DecimalText, nonEquityPercent: DecimalText,
  marketValue: DecimalText, notionalValue: DecimalText, byAssetClass: S.Array(S.Struct({ assetClass: text, rows: count,
    weightPercent: DecimalText, marketValue: DecimalText, notionalValue: DecimalText })) })
// Selected, normalized source facts only. Raw artifacts and decoder inputs are never part of this model.
const composition = S.Struct({ fundIsin: text, fundName: text, asOf: nullableDate, retrievedAt: recordedDate, sourceUrl: publicUrl,
  termsUrl: publicUrl, sha256: text, parserVersion: S.Literal(1), weightUnit: S.Literal('percent'), scope: S.Literal('top-ten', 'full-holdings'),
  measure: S.optional(S.Literal('issuer-reported-allocation-estimate')), estimateLimitation: S.optional(limitation), provider: S.optional(provider),
  sourceAccounting: S.optional(accounting), sourceChecks: S.optional(S.Array(check)), sourceParserVersion: S.optional(text),
  rows: S.Array(S.Struct({ name: text, isin: nullable, weightPercent: DecimalText, issue: nullable })),
  disclosedPercent: DecimalText, identifiedPercent: DecimalText, missingPercent: DecimalText,
})
const groupEvidence = S.Struct({ version: text, issuerId: text, name: text, reviewedAt: recordedDate, relationship: text,
  securities: S.Array(S.Struct({ isin: text, shareClass: text, symbol: text, source: text, sha256: text, retrievedAt: recordedDate })),
  issuerSource: S.Struct({ url: publicUrl, document: text, periodEnd: nullableDate, readAt: recordedDate, method: text, finding: text }), scope: text })
const gap = { account: text, isin: text, name: text, currency: S.NullOr(currency), value: decimal, reason: text }
const coverageAmount = { nonCompanyValue: S.optional(decimal), currency, pricedSecurities: DecimalText, knownCompanyValue: DecimalText, unresolvedValue: DecimalText, knownPercent: decimal }
const attempt = S.Struct({ at: recordedDate, id: text, status: S.Literal('success', 'failed'), code: nullable })
const sourceAttempt = S.Struct({ at: recordedDate, id: text, status: S.Literal('success', 'failed'), code: nullable,
  providerId: S.optional(text), outcome: text, resolution: text, httpStatus: S.optional(count) })
const refresh = S.Struct({ active: S.Boolean, automatic: S.Boolean, currentFundIsin: nullable,
  attempts: S.Record({ key: text, value: sourceAttempt }), warning: nullable })
export const ExposureSchema = S.Struct({ rows: S.Array(security),
  issuerGroups: S.Array(S.Struct({ issuerId: text, name: text, currency: S.NullOr(currency), knownTotal: decimal,
    direct: decimal, indirect: decimal, unknownContributions: count, members: S.Array(security), evidence: groupEvidence, measure: text })),
  coverage: S.Array(S.Struct(coverageAmount)), gaps: S.Array(S.Struct({ ...gap, sourceDetail: nullable })), composition: S.NullOr(composition),
  compositions: S.Array(composition), attempt: S.NullOr(attempt), refreshing: S.Boolean, pilotOwned: S.Boolean,
  holdingsAt: nullableDate, missingValuations: count,
  directStockCoverage: S.Array(S.Struct({ isin: text, name: text, account: text, currency: S.NullOr(currency), value: decimal,
    valuationStatus: text, validIsin: S.Boolean, matchedFunds: S.Array(S.Struct({ fundIsin: text, sha256: text, asOf: nullableDate })), finding: text, nextAction: text })),
  stale: S.Boolean, refreshFailed: S.Boolean, warning: nullable,
  sourceAttempts: S.Record({ key: text, value: sourceAttempt }), issuerRefresh: refresh,
})
export const CoverageSchema = S.Struct({
  manualValuations: S.optional(count),
  totals: S.Array(S.Struct({ ...coverageAmount, state: S.Literal('unavailable', 'incompatible', 'allocated', 'partial'), nonCompanyValue: decimal })),
  pricedCount: count, unvalued: count, zeroCount: count, positionCount: count,
  companyGrouping: S.Literal('partial', 'unavailable'), reconciliation: S.Literal('pending'), holdingsAt: nullableDate,
  quoteDates: dateRange, compositionDates: dateRange, staleQuotes: count, staleCompositions: count, refreshFailed: S.Boolean, warning: nullable,
  counts: S.Struct({ held: count, saved: count, checked: count, used: count, underlyingOnly: count }),
  funds: S.Array(S.Struct({ isin: text, name: text, provider: text, state: text, saved: S.Boolean, checked: S.Boolean, used: S.Boolean,
    compositionDate: nullableDate, sourceHash: nullable, quoteDates: dateRange,
    values: S.Array(S.Struct({ currency, priced: DecimalText, included: DecimalText, unassigned: DecimalText, percent: decimal })),
    unvalued: count, nextAction: text, reason: text, evidenceAction: text, sourceUrl: S.NullOr(publicUrl), rowCount: S.NullOr(count), acquisitionState: text })),
  gaps: S.Array(S.Struct({ ...gap, sourceDetail: S.optional(nullable), fund: S.Boolean, nextAction: text })),
})
const evidence = S.Struct({ fileName: nullable, format: nullable, bytes: S.NullOr(count), sha256: nullable,
  manifestVerified: S.Boolean, identityVerified: S.optional(S.Boolean), weightUnit: S.optional(S.NullOr(unit)), denominator: S.optional(text),
  sourceUrl: S.NullOr(publicUrl), compositionDate: nullableDate, lastVerifiedAt: nullableDate, rowCount: S.NullOr(count), equityRowCount: S.NullOr(count),
  identifierRowCount: S.NullOr(count), isinRowCount: S.optional(S.NullOr(count)), tickerRowCount: S.optional(S.NullOr(count)),
  weightRowCount: S.NullOr(count), nonEquityRowCount: S.NullOr(count), error: nullable })
const inspection = S.Struct({ reportedRowCount: count, benchmarkRowCount: count, responseSha256: text, requestSha256: text,
  replicationMethod: nullable, benchmarkName: nullable, benchmarkTicker: nullable, swapCounterparties: nullable,
  sourceLimits: S.Array(S.Struct({ id: text, detail: text })) })
const fund = { isin: text, name: text, provider: text, source: text, sourceUrl: S.NullOr(publicUrl), compositionDate: nullableDate, lastVerifiedAt: nullableDate,
  acquisitionState: S.Literal('acquired', 'missing', 'underlying-observation', 'rejected', 'unreadable', 'unbound'),
  qualificationState: S.Literal('open', 'not-started', 'failed', 'ready'), validated: S.Boolean,
  allocationReadiness: S.optional(S.Struct({ measure: S.Literal('issuer-reported-allocation-estimate'), checks: S.Array(check),
    accountingNav: S.Literal('not-reconciled'), economicCoverage: S.Literal('equities-only'), localUsePermission: S.Literal('unsettled'), estimateLimitation: S.optional(limitation) })),
  calculationCoverage: S.optional(S.Struct({ identifiedPercent: DecimalText, remainingPercent: DecimalText, compositionDate: nullableDate })),
  usedInCalculation: S.Boolean, calculationSource: nullable, evidence, inspection: S.optional(inspection), blocker: text, nextAction: text, identityNote: text }
export const DevelopmentFundSchema = S.Struct(fund)
const progressState = S.Literal('ready', 'open', 'blocked', 'unavailable', 'not-admitted')
export const DevelopmentSchema = S.Struct({ generatedAt: recordedDate,
  connectivity: S.Struct({ localService: S.Literal('available'), broker: text, savedData: text, sourceEvidence: text }),
  portfolio: S.Struct({ snapshotAt: nullableDate, positionCount: count, fundCount: count, funds: S.Array(S.Struct({ isin: text, name: text })) }),
  evidence: S.Struct({ configured: S.Boolean, manifestRecordedAt: nullableDate, manifestFiles: S.NullOr(count), manifestMismatches: S.NullOr(count), diagnostics: S.Array(text) }),
  counts: S.Struct({ portfolioFunds: count, acquiredFunds: count, qualifiedFunds: count, usedFunds: count, acquiredRows: count, identifiedRows: count }),
  stages: S.Array(S.Struct({ id: text, title: text, purpose: text, state: progressState, summary: text,
    checks: S.Array(S.Struct({ label: text, state: progressState, detail: text })) })),
  funds: S.Array(DevelopmentFundSchema), sourceFreshness: S.Struct({ lastVerifiedAt: nullableDate, asOfRange: dateRange, note: text }),
})
const FundValuationSchema = S.Struct({ valuationReason: nullable, positionValue: decimal,
  currency: S.NullOr(currency), accountCount: count, holdingsAt: nullableDate, quoteDates: S.Array(recordedDate) })
export const FundDetailSchema = S.Struct({ ...fund,
  valuation: S.optional(FundValuationSchema),
  illustrative: S.optional(S.Struct({ kind: S.Literal('selected-allocation', 'conditional'), reason: nullable, valuationReason: nullable,
    positionValue: decimal, currency: S.NullOr(currency), accountCount: count, holdingsAt: nullableDate, quoteDates: S.Array(recordedDate),
    rows: S.Array(S.Struct({ row: count, state: S.Literal('included', 'conditional', 'unavailable'), value: decimal, reason: nullable, relativeBar: S.NullOr(S.Number) })) })),
  rows: S.Array(S.Struct({ row: count, name: text, isin: nullable, ticker: nullable, weightPercent: nullable,
    weight: S.optional(nullable), weightUnit: S.optional(S.NullOr(unit)),
    sourceScope: S.optional(S.NullOr(S.Literal('economic-allocation', 'substitute-basket', 'partial-benchmark'))),
    quantity: S.optional(nullable), sector: S.optional(nullable), securityType: nullable, currency: nullable, exchange: nullable, country: nullable,
    availableIdentifiers: S.Array(text) })),
  rowPage: S.Struct({ total: count, identifiers: count, reportedWeights: count }),
})
export const DiagnosticsSchema = S.Struct({ events: S.Array(S.Struct({ attemptId: text, operation: text, stage: text,
  connectionId: S.optional(text), providerId: S.optional(text),
  event: text, at: recordedDate, durationMs: S.Number, category: text, httpStatus: S.optional(count), networkCode: S.optional(text),
  sourceId: S.optional(text), terminal: S.optional(S.Boolean), outcome: S.optional(S.Struct({
    holdings: S.NullOr(S.Struct({ snapshotId: count, fetchedAt: text })), valuation: text, sources: S.Array(S.Struct({ id: text, status: text })),
  })) })) })
export const AnalysisInputSchema = S.Struct({ exposure: ExposureSchema, coverage: CoverageSchema })
export const financialSchemas = { overview: OverviewSchema, exposure: ExposureSchema, coverage: CoverageSchema,
  development: DevelopmentSchema, fund: FundDetailSchema, diagnostics: DiagnosticsSchema, analysis: AnalysisInputSchema }
export type FinancialResource = keyof typeof financialSchemas
export type Overview = typeof OverviewSchema.Type
export type ValuedPosition = typeof ValuedPositionSchema.Type
export type Exposure = typeof ExposureSchema.Type
export type CoverageReport = typeof CoverageSchema.Type
export type DevelopmentFund = typeof DevelopmentFundSchema.Type
export type DevelopmentFundDetail = typeof FundDetailSchema.Type
export type DevelopmentProgress = typeof DevelopmentSchema.Type
export type ProgressState = typeof progressState.Type
export type FinancialModels = { [K in FinancialResource]: typeof financialSchemas[K]['Type'] }
export const financialEnvelope = <A, I>(resource: FinancialResource, schema: S.Schema<A, I>) => S.Struct({
  contractVersion: S.Literal(financialContractVersion), resource: S.Literal(resource), snapshot: S.Struct({ kind: S.Literal('live-projection'), id: text.pipe(S.pattern(/^[a-f0-9]{64}$/)) }), data: schema,
})
