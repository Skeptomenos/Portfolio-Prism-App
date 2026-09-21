import { Decimal } from 'decimal.js'
import type { Composition } from './composition'
import { qualifyIssuerBundle, type IssuerBundle } from './issuer-evidence'
const D = Decimal.clone({ precision: 256 })
export function issuerComposition(bundle: IssuerBundle): Composition {
  const report = qualifyIssuerBundle(bundle)
  if (!report.eligibleForMonetaryExposure || !report.candidate) throw Error('Issuer qualification incomplete')
  const candidate = report.candidate
  const rows = candidate.rows.filter(row => row.assetClass === 'Equity').map(row => ({
    name: row.name, isin: row.equityIdentity === 'valid-isin' ? row.isin : null,
    weightPercent: row.weightPercent, issue: row.equityIdentity === 'valid-isin' ? null : 'Unresolved security identity',
  }))
  const identified = rows.filter(row => row.isin).reduce((sum, row) => sum.add(row.weightPercent), new D(0))
  if (identified.lt(0) || identified.gt(100)) throw Error('Invalid equity allocation')
  return { fundIsin: candidate.fundIsin, fundName: bundle.profile.fundName, asOf: candidate.asOf,
    retrievedAt: candidate.retrievedAt, sourceUrl: bundle.profile.productUrl, termsUrl: bundle.profile.termsUrl,
    sha256: candidate.sha256, parserVersion: 1, sourceParserVersion: candidate.parserVersion, weightUnit: 'percent',
    scope: 'full-holdings', measure: 'issuer-reported-allocation-estimate', rows,
    estimateLimitation: bundle.profile.estimateLimitation,
    disclosedPercent: candidate.accounting.reportedPercent, identifiedPercent: identified.toFixed(), missingPercent: '0',
    sourceAccounting: candidate.accounting, sourceChecks: report.checks, sourceRows: candidate.rows }
}
