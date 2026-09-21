import { Decimal } from 'decimal.js'
import type { Composition } from './composition'
import { qualifyIusaEvidence, type IusaEvidenceBundle } from './iusa-evidence'
import { iusaProductUrl, iusaTermsUrl } from './iusa-qualification'
const D = Decimal.clone({ precision: 256 })
export function iusaComposition(bundle: IusaEvidenceBundle): Composition {
  const result = qualifyIusaEvidence(bundle)
  if (!result.eligibleForMonetaryExposure || !result.candidate) throw Error('IUSA qualification incomplete')
  const c = result.candidate
  const rows = c.rows.filter(r => r.assetClass === 'Equity').map(r => ({
    name: r.name, isin: r.equityIdentity === 'valid-isin' && new D(r.weightPercent).gte(0) ? r.isin : null,
    weightPercent: r.weightPercent, issue: r.equityIdentity !== 'valid-isin' || new D(r.weightPercent).lt(0) ? 'Unsupported equity identity or signed exposure' : null,
  }))
  const identified = rows.filter(r => r.isin).reduce((s,r) => s.add(r.weightPercent), new D(0))
  if (identified.gt(100) || identified.lt(0)) throw Error('IUSA equity allocation outside long-only scope')
  return { fundIsin: c.fundIsin, fundName: 'iShares Core S&P 500 UCITS ETF USD (Dist)',
    asOf: c.asOf, retrievedAt: c.retrievedAt, sourceUrl: iusaProductUrl, termsUrl: iusaTermsUrl,
    sha256: c.sha256, parserVersion: 1, sourceParserVersion: c.parserVersion,
    weightUnit: 'percent', scope: 'full-holdings', measure: 'issuer-reported-allocation-estimate',
    rows, disclosedPercent: c.accounting.reportedPercent, identifiedPercent: identified.toFixed(),
    // Whole table acquired. The monetary remainder is 100 - admitted equity, not missing rows.
    missingPercent: '0', sourceAccounting: c.accounting, sourceChecks: result.checks, sourceRows: c.rows }
}
