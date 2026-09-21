import { Decimal } from 'decimal.js'
import type { AnalysisInput } from './financial-client'
const D = Decimal.clone({ precision: 256 })
export const contributionMixMethod = { id: 'contribution-mix', version: '1.0.0', inputContract: 'portfolio-financial/1',
  meaning: 'Sum already included direct and ETF contributions separately within each currency; never add issuer subtotals or unassigned value.' } as const
export function contributionMix(input: AnalysisInput) {
  const contributions = input.exposure.rows.flatMap(row => row.contributions.map(item => ({ ...item, currency: row.currency })))
  return input.coverage.totals.map(total => {
    const selected = contributions.filter(item => item.currency === total.currency)
    const sum = (kind: 'direct' | 'etf') => selected.filter(item => item.kind === kind && item.value !== null)
      .reduce((value, item) => value.add(item.value!), new D(0))
    const direct = sum('direct'), etf = sum('etf')
    if (!direct.add(etf).eq(total.knownCompanyValue)) throw new Error('Contribution inputs do not reconcile with canonical coverage')
    return { currency: total.currency, direct: direct.toFixed(), etf: etf.toFixed(),
      unknownContributions: selected.filter(item => item.value === null).length }
  })
}
export type ContributionMix = ReturnType<typeof contributionMix>
