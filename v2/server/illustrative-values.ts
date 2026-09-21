import { Decimal } from 'decimal.js'
import type { ConstituentObservation, DevelopmentFund } from './development'
import type { overview } from './overview'
import { validIsin, type Composition } from './composition'
import { exposure } from './exposure'

const D = Decimal.clone({ precision: 256 })
// Bounded exact contexts whose retained source supports the labelled allocation estimate.
// This is permission for conditional arithmetic, never calculation admission.
const allocationEstimateFunds = new Set([
  'IE0031442068',
  'IE00B4L5Y983',
  'IE00B53SZB19',
  'IE00BYVQ9F29',
  'DE000A0F5UF5',
  'IE00B3WJKG14',
])
export function reportedWeight(value: string | null): Decimal | null {
  if (
    value === null ||
    value.length > 128 ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
  )
    return null
  const exponent = value.split(/e/i)[1]
  if (exponent && Math.abs(Number(exponent)) > 128) return null
  const number = new D(value)
  return number.isFinite() && number.gte(0) && number.lte(100) ? number : null
}
export function plainEquity(row: ConstituentObservation): boolean {
  return /^(equity|aktien)$/i.test(row.securityType?.trim() ?? '')
}
export function illustrativeValues(
  fund: DevelopmentFund,
  rows: ConstituentObservation[],
  valuation: ReturnType<typeof overview>,
  selected: Composition | null = null
) {
  const positions = valuation.rows.filter((position) => position.isin === fund.isin)
  const quoteDates = [
    ...new Set(
      positions.map((position) => position.quoteAt).filter((date): date is string => !!date)
    ),
  ].sort()
  let reason: string | null = null
  if (fund.acquisitionState === 'underlying-observation')
    reason = 'Shared underlying data: the held class hedge is not represented.'
  else if (fund.acquisitionState !== 'acquired')
    reason = 'A readable, identity-verified composition is required.'
  else if (!allocationEstimateFunds.has(fund.isin))
    reason = 'This fund/class context is not supported for illustrative values.'
  else if (!fund.evidence.identityVerified || !fund.evidence.manifestVerified)
    reason = 'Source identity and integrity must be verified.'
  else if (fund.evidence.weightUnit !== 'percent')
    reason = 'Explicit percentage units are required.'
  else if (!fund.compositionDate) reason = 'The composition date is unknown.'
  let valuationReason: string | null = null
  const nonzero = positions.filter((position) => !new D(position.quantity).isZero())
  if (!valuationReason && !nonzero.length)
    valuationReason = 'No nonzero saved holding is available.'
  if (
    !valuationReason &&
    new Set(positions.map((position) => position.account)).size !== positions.length
  )
    valuationReason = 'Duplicate account positions prevent a safe total.'
  if (!valuationReason && nonzero.some((position) => new D(position.quantity).isNegative()))
    valuationReason = 'Negative holdings are not supported for this preview.'
  if (
    !valuationReason &&
    nonzero.some(
      (position) =>
        position.valuationStatus !== 'priced' ||
        position.value === null ||
        !position.currency ||
        !position.quoteAt
    )
  )
    valuationReason =
      'At least one account has no compatible priced holding or quote date; no accounts are omitted.'
  if (!valuationReason && new Set(nonzero.map((position) => position.currency)).size !== 1)
    valuationReason =
      'Holdings span currencies; no combined estimate or currency conversion is made.'
  const currency = !valuationReason ? nonzero[0].currency : null
  const positionValue = !valuationReason
    ? nonzero.reduce((sum, position) => sum.add(position.value!), new D(0)).toFixed()
    : null
  reason ??= valuationReason
  const largestEquityWeight = rows.reduce((largest, row) => {
    const weight = plainEquity(row) ? reportedWeight(row.weightPercent) : null
    return weight && weight.gt(largest) ? weight : largest
  }, new D(0))
  // Inclusion must come from the exact selected source and actual exposure projection.
  const selectedMatches = selected?.scope === 'full-holdings' &&
    selected.measure === 'issuer-reported-allocation-estimate' && selected.fundIsin === fund.isin &&
    selected.sha256 === fund.evidence.sha256 && selected.asOf === fund.compositionDate &&
    fund.usedInCalculation && fund.validated
  const actual = selectedMatches ? exposure(valuation, selected, null) : null
  return {
    kind: selectedMatches ? 'selected-allocation' as const : 'conditional' as const,
    reason,
    valuationReason,
    positionValue,
    currency,
    accountCount: positions.length,
    holdingsAt: valuation.holdingsAt,
    quoteDates,
    rows: rows.map((row) => {
      const weight = reportedWeight(row.weightPercent)
      const excluded =
        reason ??
        (!plainEquity(row)
          ? 'Not a plain equity row.'
          : !row.isin || !validIsin(row.isin)
            ? 'A valid security ISIN is required.'
            : weight === null
              ? 'A valid nonnegative percentage from 0 to 100 is required.'
              : null)
      const value = excluded ? null : new D(positionValue!).mul(weight!).div(100).toFixed()
      const sourceRow = selectedMatches ? selected.sourceRows?.find(source => source.sourceRow === row.row) : null
      const contributions = actual?.rows.find(item => item.isin === row.isin && item.currency === currency)
        ?.contributions.filter(item => item.kind === 'etf' && item.positionIsin === fund.isin) ?? []
      const included = value !== null && sourceRow?.equityIdentity === 'valid-isin' &&
        sourceRow.isin === row.isin && sourceRow.weightPercent === row.weightPercent &&
        sourceRow.assetClass === row.securityType && contributions.length === nonzero.length &&
        contributions.every(item => item.value !== null && item.weightPercent === row.weightPercent) &&
        contributions.reduce((sum, item) => sum.add(item.value!), new D(0)).eq(value)
      return {
        row: row.row,
        state: included ? 'included' as const : value !== null ? 'conditional' as const : 'unavailable' as const,
        value,
        reason: excluded,
        relativeBar:
          plainEquity(row) && weight && largestEquityWeight.gt(0)
            ? weight.div(largestEquityWeight).mul(100).toNumber()
            : null,
      }
    }),
  }
}
export type IllustrativeValues = ReturnType<typeof illustrativeValues>
