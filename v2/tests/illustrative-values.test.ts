import { describe, it, expect } from 'vitest'
import { Decimal } from 'decimal.js'
import { illustrativeValues } from '../server/illustrative-values'
import { exposure } from '../server/exposure'
import { withSourceReadiness } from '../server/exposure-readiness'
import {
  developmentCounts,
  type DevelopmentFund,
  type ConstituentObservation,
} from '../server/development'
import type { overview, ValuedPosition } from '../server/overview'

const fund: DevelopmentFund = {
  isin: 'IE00B4L5Y983',
  name: 'Synthetic World',
  provider: 'iShares',
  source: 'Synthetic',
  sourceUrl: null,
  compositionDate: '2026-09-10',
  lastVerifiedAt: '2026-09-11',
  acquisitionState: 'acquired',
  qualificationState: 'not-started',
  validated: false,
  usedInCalculation: false,
  calculationSource: null,
  blocker: 'Pending',
  nextAction: 'Check',
  identityNote: 'Exact',
  evidence: {
    fileName: null,
    format: null,
    bytes: null,
    sha256: null,
    manifestVerified: true,
    identityVerified: true,
    weightUnit: 'percent',
    sourceUrl: null,
    compositionDate: '2026-09-10',
    lastVerifiedAt: null,
    rowCount: 1,
    equityRowCount: 1,
    identifierRowCount: 1,
    weightRowCount: 1,
    nonEquityRowCount: 0,
    error: null,
  },
}
const row: ConstituentObservation = {
  row: 1,
  name: 'Synthetic NVIDIA row',
  isin: 'US67066G1040',
  ticker: 'NVDA',
  weightPercent: '5.53211',
  securityType: 'Equity',
  currency: 'USD',
  exchange: null,
  country: null,
  availableIdentifiers: ['ISIN'],
}
const position: ValuedPosition = {
  isin: fund.isin,
  name: fund.name,
  account: 'synthetic-a',
  quantity: '1',
  averageBuyIn: '1',
  instrumentType: 'fund',
  value: '12786.55',
  currency: 'EUR',
  price: '12786.55',
  quoteAt: '2026-09-08T16:11:19.133Z',
  venue: 'LSX',
  quality: 'Saved quote',
  weight: null,
  quantityObservedAt: '2026-09-08T12:00:00Z',
  valuationStatus: 'priced',
}
const valued = (rows = [position]): ReturnType<typeof overview> => ({
  rows,
  totals: [],
  pricedCount: rows.length,
  zeroCount: 0,
  missingCount: 0,
  holdingsAt: '2026-09-08T16:11:15Z',
  quoteRetrievedAt: null,
})

describe('conditional row arithmetic, never exposure admission', () => {
  it('calculates the displayed NVIDIA example without FX or normalization', () => {
    const result = illustrativeValues(fund, [row], valued())
    expect(result.rows[0].value).toBe('707.366011205')
    expect(new Decimal(result.rows[0].value!).toFixed(2)).toBe('707.37')
    expect(result.currency).toBe('EUR')
    expect(result.quoteDates).toEqual([position.quoteAt])
    expect(result.kind).toBe('conditional')
    expect(fund.validated).toBe(false)
    expect(withSourceReadiness(exposure(valued(), null, null), [fund]).rows).toEqual([])
  })
  it('uses unrounded values, sums distinct same-currency accounts exactly and retains quote dates', () => {
    const result = illustrativeValues(
      fund,
      [row],
      valued([
        { ...position, value: '0.000000000000000001' },
        {
          ...position,
          account: 'synthetic-b',
          value: '12786.550001',
          quoteAt: '2026-09-09T12:00:00Z',
        },
      ])
    )
    expect(result.positionValue).toBe('12786.550001000000000001')
    expect(result.rows[0].value).toBe('707.3660112603211000000553211')
    expect(result.accountCount).toBe(2)
    expect(result.quoteDates).toHaveLength(2)
  })
  it.each(['Cash', 'Futures', 'FX', 'Swap', 'Money Market', 'Equity derivative', null])(
    'excludes non-plain equity: %s',
    (securityType) => {
      const result = illustrativeValues(fund, [{ ...row, securityType }], valued())
      expect(result.rows[0]).toMatchObject({
        value: null,
        reason: 'Not a plain equity row.',
        relativeBar: null,
      })
    }
  )
  it.each([null, '-1', '100.01', 'NaN', 'Infinity', '1,2', '1e999', '1e-999999999999', ''])(
    'rejects missing/invalid weight %s',
    (weightPercent) => {
      expect(
        illustrativeValues(fund, [{ ...row, weightPercent }], valued()).rows[0].value
      ).toBeNull()
    }
  )
  it('preserves explicit zero weight and rejects missing identity', () => {
    expect(illustrativeValues(fund, [{ ...row, weightPercent: '0' }], valued()).rows[0].value).toBe(
      '0'
    )
    expect(illustrativeValues(fund, [{ ...row, isin: null }], valued()).rows[0].reason).toContain(
      'ISIN'
    )
  })
  it.each(['missing', 'rejected', 'unreadable', 'unbound', 'underlying-observation'] as const)(
    'excludes source state %s but retains the ETF holding value',
    (acquisitionState) => {
      const result = illustrativeValues({ ...fund, acquisitionState }, [row], valued())
      expect(result.rows[0].value).toBeNull()
      expect(result.reason).toBeTruthy()
      expect(result.positionValue).toBe('12786.55')
    }
  )
  it.each([
    { identityVerified: false },
    { manifestVerified: false },
    { weightUnit: null },
  ] as const)('requires identity, integrity and explicit units: %j', (evidence) => {
    expect(
      illustrativeValues({ ...fund, evidence: { ...fund.evidence, ...evidence } }, [row], valued())
        .rows[0].value
    ).toBeNull()
  })
  it('admits NQSE for the labelled estimate while keeping unsupported contexts excluded', () => {
    const nqse = illustrativeValues(
      { ...fund, isin: 'IE00BYVQ9F29' },
      [row],
      valued([{ ...position, isin: 'IE00BYVQ9F29' }])
    )
    expect(nqse.reason).toBeNull()
    expect(nqse.rows[0].value).toBe('707.366011205')
    expect(
      illustrativeValues(
        { ...fund, isin: 'FR0010361683' },
        [row],
        valued([{ ...position, isin: 'FR0010361683' }])
      ).reason
    ).toContain('context')
  })
  it.each([
    [
      { ...position, account: 'b', value: null, valuationStatus: 'unavailable' as const },
      'no compatible',
    ],
    [{ ...position, account: 'b', currency: 'USD' }, 'span currencies'],
    [{ ...position, account: 'b', quantity: '-1' }, 'Negative'],
    [position, 'Duplicate'],
  ] as const)('never silently omits or double counts another account', (other, reason) => {
    const result = illustrativeValues(fund, [row], valued([position, other]))
    expect(result.reason).toContain(reason)
    expect(result.positionValue).toBeNull()
    expect(result.rows[0].value).toBeNull()
  })
  it('does not manufacture value from absent holdings and excludes signed rows from bars', () => {
    expect(illustrativeValues(fund, [row], valued([])).rows[0].value).toBeNull()
    const result = illustrativeValues(
      fund,
      [
        row,
        { ...row, row: 2, weightPercent: '-5' },
        { ...row, row: 3, securityType: 'FX', weightPercent: '90' },
      ],
      valued()
    )
    expect(result.rows.map((r) => r.relativeBar)).toEqual([100, null, null])
  })
  it.each([
    ['acquired', 'Composition data saved; checks and calculation integration pending'],
    ['missing', 'Composition missing'],
    ['rejected', 'failed integrity'],
    ['unreadable', 'cannot be read'],
    ['unbound', 'unverified'],
    ['underlying-observation', 'class hedge'],
  ] as const)(
    'describes portfolio-wide gap state %s without changing arithmetic',
    (acquisitionState, text) => {
      const before = exposure(valued(), null, null)
      const after = withSourceReadiness(exposure(valued(), null, null), [
        { ...fund, acquisitionState },
      ])
      expect(after.gaps[0].reason).toContain(text)
      expect(after.gaps[0].sourceDetail).toBe(fund.isin)
      expect(after.gaps[0].value).toBe(position.value)
      expect(after.rows).toEqual(before.rows)
      expect(after.coverage).toEqual(before.coverage)
    }
  )
  it('derives readiness/inclusion counts from state rather than a static zero', () => {
    const before = developmentCounts([fund])
    illustrativeValues(fund, [row], valued())
    expect(developmentCounts([fund])).toEqual(before)
    expect(before.qualifiedFunds).toBe(0)
    expect(
      developmentCounts([
        { ...fund, validated: true, qualificationState: 'ready', usedInCalculation: true },
      ])
    ).toMatchObject({ acquiredFunds: 1, qualifiedFunds: 1, usedFunds: 1 })
  })
})
