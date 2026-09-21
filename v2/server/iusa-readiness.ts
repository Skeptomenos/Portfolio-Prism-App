import { Decimal } from 'decimal.js'
import type { Composition } from './composition'
import { developmentCounts, type DevelopmentProgress, type DevelopmentFundDetail } from './development'
import { validIsin } from './composition'
import { qualifyRetainedIusa } from './iusa-evidence'
import { qualifyRetainedIssuer } from './issuer-evidence'
import { issuerProfiles } from './issuer-profiles'
import type { SourceCheck } from './iusa-qualification'

export interface AllocationReadiness {
  measure: 'issuer-reported-allocation-estimate'
  checks: SourceCheck[]
  accountingNav: 'not-reconciled'
  economicCoverage: 'equities-only'
  localUsePermission: 'unsettled'
  estimateLimitation?: Composition['estimateLimitation']
}
export function iusaReadiness(progress: DevelopmentProgress, selected: Composition | null, directory: string | null): DevelopmentProgress {
  return issuerReadiness(progress, selected ? [selected] : [], directory)
}
export function issuerReadiness(progress: DevelopmentProgress, selected: readonly Composition[], directory: string | null): DevelopmentProgress {
  const funds = progress.funds.map(fund => {
    if (fund.isin !== 'IE0031442068' && !issuerProfiles[fund.isin]) return fund
    const active = selected.find(source => source.fundIsin === fund.isin && source.scope === 'full-holdings') ?? null
    const report = directory ? (fund.isin === 'IE0031442068' ? qualifyRetainedIusa(directory) : qualifyRetainedIssuer(directory, fund.isin)) : null
    const selectedRows = active?.sourceRows ?? []
    const validated = !!active || report?.eligibleForMonetaryExposure === true
    const limitation = active?.estimateLimitation ?? issuerProfiles[fund.isin]?.estimateLimitation
    return { ...fund, validated,
      qualificationState: validated ? 'ready' as const : report?.state === 'failed' ? 'failed' as const : 'open' as const,
      allocationReadiness: { measure: 'issuer-reported-allocation-estimate' as const, checks: active?.sourceChecks ?? report?.checks ?? [],
        estimateLimitation: limitation,
        accountingNav: 'not-reconciled' as const, economicCoverage: 'equities-only' as const, localUsePermission: 'unsettled' as const },
      ...(active ? {
        acquisitionState: 'acquired' as const, usedInCalculation: true,
        calculationSource: 'Saved iShares full holdings · issuer-reported allocation estimate',
        calculationCoverage: { identifiedPercent: active.identifiedPercent,
          remainingPercent: new Decimal(100).sub(active.identifiedPercent).toFixed(), compositionDate: active.asOf },
        source: 'Saved iShares full holdings', compositionDate: active.asOf, lastVerifiedAt: active.retrievedAt,
        sourceUrl: active.sourceUrl,
        evidence: { ...fund.evidence, error: null, manifestVerified: true, identityVerified: true,
          fileName: null, format: 'Persisted issuer evidence bundle', sha256: active.sha256, sourceUrl: active.sourceUrl,
          compositionDate: active.asOf, lastVerifiedAt: active.retrievedAt, rowCount: active.sourceAccounting!.sourceRows,
          equityRowCount: active.sourceAccounting!.equityRows, nonEquityRowCount: active.sourceAccounting!.nonEquityRows,
          identifierRowCount: selectedRows.filter(row => (row.isin && validIsin(row.isin)) || row.ticker).length,
          isinRowCount: selectedRows.filter(row => row.isin && validIsin(row.isin)).length,
          tickerRowCount: selectedRows.filter(row => row.ticker).length,
          weightRowCount: active.sourceAccounting!.sourceRows, weightUnit: 'percent' as const,
          denominator: 'Whole published holdings portfolio; allocation estimate, not NAV reconciliation' },
      } : {}),
      blocker: validated ? `${limitation ? limitation.qualifier + ' ' : ''}Published equity allocation is qualified. NAV/economic reconciliation and private reuse permission remain unresolved.` : 'Source checks are incomplete or failed; the existing calculation input is preserved.',
      nextAction: validated ? active ? active.provider ? 'Automatic public-source refresh is implemented; inspect its latest per-fund outcome. Non-equity economics and source-use permission remain unresolved.' : 'Resolve non-equity economics and source-use permission; refresh issuer holdings to replace this retained publication.' : 'Import the checked retained evidence to select it for calculation; preserve the top-ten recovery source.' : 'Inspect the criterion-level findings and restore or qualify the exact source evidence.',
      ...(validated && limitation ? { nextAction: limitation.nextAction } : {}),
    }
  })
  const qualifiedFunds = funds.filter(f => f.validated).length
  const usedFunds = funds.filter(f => f.usedInCalculation).length
  const counts = developmentCounts(funds)
  return { ...progress, funds, counts,
    stages: progress.stages.map(stage => stage.id === 'acquisition' ? { ...stage,
      state: counts.acquiredFunds > 0 ? 'open' as const : 'blocked' as const,
      summary: `${counts.acquiredFunds}/${funds.length} ETFs have saved source observations; ${funds.length - counts.acquiredFunds} have none. Saved observations do not establish full economic composition.`,
      checks: [
        { label: 'Saved source observations', state: counts.acquiredRows > 0 ? 'ready' as const : 'open' as const,
          detail: `${counts.acquiredRows.toLocaleString()} reported holdings/basket rows are inspectable from saved evidence. Partial benchmark rows remain separate.` },
        { label: 'Exact-fund source coverage', state: counts.acquiredFunds === funds.length && funds.length > 0 ? 'ready' as const : 'open' as const,
          detail: `${funds.length - counts.acquiredFunds} held fund(s) lack saved source observations. Inspection-only baskets still need economic composition evidence.` },
      ],
    } : stage.id === 'identity' ? { ...stage,
      checks: stage.checks.map(check => check.label !== 'Available identifiers' ? check : { ...check,
        state: counts.identifiedRows > 0 ? 'ready' as const : 'open' as const,
        detail: `${counts.identifiedRows.toLocaleString()} saved holdings/basket rows expose an identifier; this does not establish company resolution.` }),
    } : stage.id === 'calculation' && usedFunds > 0 ? { ...stage,
      state: 'open' as const,
      summary: `${usedFunds}/${funds.length} funds use selected saved compositions. Each issuer allocation retains its own evidence and remainder; other fund gaps remain unresolved.`,
      checks: stage.checks.map(check => check.label === 'Current calculation input' ? { ...check,
        state: 'ready' as const, detail: 'Persisted per-fund holdings are selected; the top-ten pilot is retained for recovery. This estimate is not NAV or full economic reconciliation.' } : check),
    } : stage.id !== 'qualification' ? stage : { ...stage,
      summary: `${qualifiedFunds}/${funds.length} qualified for their stated allocation measure; full economic and NAV reconciliation remain open.`,
      checks: stage.checks.map(check => check.label === 'Row and identifier accounting' ? { ...check,
        state: counts.identifiedRows > 0 ? 'ready' as const : 'open' as const,
        detail: `${counts.identifiedRows.toLocaleString()} saved holdings/basket rows expose an identifier; missing identifiers remain visible.`,
      } : check.label !== 'Weight basis and non-equity semantics' ? check : { ...check,
        detail: 'Compatible whole-published-portfolio weights support a labelled equity allocation estimate when the executable checks pass. Cash, collateral, futures and class-specific hedge effects stay separate; rights and wider economic coverage remain open.' }) }) }
}
export function iusaDetail(detail: DevelopmentFundDetail, progress: DevelopmentProgress, selected: Composition | null): DevelopmentFundDetail {
  const summary = progress.funds.find(f => f.isin === detail.isin)
  if (!summary) return detail
  if (detail.isin !== selected?.fundIsin || selected.scope !== 'full-holdings') return { ...detail, ...summary }
  const rows = selected.sourceRows!.map(row => ({ row: row.sourceRow, name: row.name, isin: row.isin,
    ticker: row.ticker, weightPercent: row.weightPercent, securityType: row.assetClass, currency: row.currency,
    exchange: row.exchange, country: row.country, availableIdentifiers: [row.isin && validIsin(row.isin) ? 'ISIN' : null, row.ticker ? 'Ticker' : null].filter((id): id is string => id !== null) }))
  return { ...detail, ...summary, rows, rowPage: { total: rows.length, identifiers: rows.filter(r => r.availableIdentifiers.length).length, reportedWeights: rows.length } }
}
