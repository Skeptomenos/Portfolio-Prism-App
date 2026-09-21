import type { DevelopmentFund } from './development'
import type { exposure } from './exposure'

// Presentation only. Never changes admitted contributions, values or denominators.
export function withSourceReadiness(
  result: ReturnType<typeof exposure>,
  funds: readonly DevelopmentFund[]
) {
  return {
    ...result,
    gaps: result.gaps.map((gap) => {
      const fund = funds.find((fund) => fund.isin === gap.isin)
      if (!fund) return { ...gap, sourceDetail: null }
      const reason = {
        acquired: fund.validated
          ? 'Composition checked; calculation integration pending'
          : fund.qualificationState === 'failed'
            ? `Calculation checks failed: ${fund.blocker}`
            : 'Composition data saved; checks and calculation integration pending',
        'underlying-observation':
          'Shared underlying data saved; class hedge checks and calculation integration pending',
        missing: 'Composition missing from saved data',
        rejected: 'Saved source failed integrity or identity checks; not usable',
        unreadable: 'Saved source cannot be read; repair required',
        unbound: 'Saved source identity or receipt is unverified; checks required',
      }[fund.acquisitionState]
      return {
        ...gap,
        sourceDetail: fund.isin,
        reason: gap.reason === 'No supported company composition or identity' ? reason : gap.reason,
      }
    }),
  }
}
