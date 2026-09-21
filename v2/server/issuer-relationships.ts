import { Decimal } from 'decimal.js'
import type { CompanyExposure } from './exposure'
const D = Decimal.clone({ precision: 256 })

// Bounded, reviewed relationship record. This is not a name/ticker resolver.
// Exchange receipts retain the original documents in the private audit evidence.
export const alphabetRelationship = {
  version: 'alphabet-equity-classes/2026-09-20.1',
  issuerId: 'sec-cik:0001652044', name: 'Alphabet Inc.', reviewedAt: '2026-09-20',
  relationship: 'Two distinct listed equity classes issued by the same registrant',
  securities: [
    { isin: 'US02079K3059', shareClass: 'Class A', symbol: 'GOOGL',
      source: 'https://live.deutsche-boerse.com/equity/alphabet-inc-class-a',
      sha256: '8eb710a1fa67bd172bb0ae428f3e814bbdb41a02dd70b98732a98edb79ea129c', retrievedAt: '2026-09-20T02:19:42.435023+00:00' },
    { isin: 'US02079K1079', shareClass: 'Class C', symbol: 'GOOG',
      source: 'https://live.deutsche-boerse.com/equity/alphabet-inc-class-c',
      sha256: 'c4f0b029a8028bcccd14ad3e63fef521db7fd91137d5bbcd4a38e4f3993393ee', retrievedAt: '2026-09-20T02:19:43.351686+00:00' },
  ],
  issuerSource: { url: 'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/R1.htm',
    document: '2026 Q2 10-Q cover', periodEnd: '2026-06-30', readAt: '2026-09-20',
    method: 'SEC document read through web retrieval; direct HTTP returned 403',
    finding: 'Registrant Alphabet Inc., CIK 0001652044; Class A GOOGL and Class C GOOG listed on Nasdaq.' },
  scope: 'Sum only monetary subtotals of these two exact equity ISINs within each currency. Preserve separate securities, rights and contribution lines. No quantity conversion or other instrument/issuer relationship is inferred.',
} as const

// Exact ISIN-to-issuer bindings from the retained 2026-09-05 GLEIF mapping.
// The lapsed LEI registration is a qualification, not a live issuer-status claim.
export const heicoRelationship = {
  version: 'heico-equity-classes/2026-09-21.1',
  issuerId: 'lei:529900O1DTDLCJ7L0I14', name: 'HEICO Corporation', reviewedAt: '2026-09-21',
  relationship: 'Two distinct equity classes mapped to the same legal issuer in dated GLEIF evidence',
  securities: [
    { isin: 'US4228061093', shareClass: 'Common Stock', symbol: 'HEI',
      source: 'https://isinmapping.gleif.org/api/v2/isin-lei/2026-09-05/download',
      sha256: '5484e771dff96dea0b55dafd33c7acec3342b96e1a61d899e5a4527185e03e20', retrievedAt: '2026-09-07T20:26:41Z' },
    { isin: 'US4228062083', shareClass: 'Class A Common Stock', symbol: 'HEI.A',
      source: 'https://isinmapping.gleif.org/api/v2/isin-lei/2026-09-05/download',
      sha256: '5484e771dff96dea0b55dafd33c7acec3342b96e1a61d899e5a4527185e03e20', retrievedAt: '2026-09-07T20:26:41Z' },
  ],
  issuerSource: { url: 'https://www.sec.gov/Archives/edgar/data/46619/000004661926000020/hei-20260731.htm',
    document: 'Q3 2026 Form 10-Q', periodEnd: null, readAt: '2026-09-07',
    method: 'Retained dated SEC web-read audit note; original SEC bytes and period-end metadata not retained',
    finding: 'HEICO common and Class A are separate NYSE equity classes. Original GLEIF mapping binds both exact ISINs to LEI 529900O1DTDLCJ7L0I14. The retained LEI record names HEICO CORPORATION; registration LAPSED, entity ACTIVE, conformity NON_CONFORMING, last update 2021-07-19. These are dated observations, not current status verification.' },
  scope: 'Sum only monetary subtotals of these two exact equity ISINs within each currency. Preserve separate securities, rights and contributions. No quantity conversion or ticker alias is inferred. Relationship uses dated 2026-09-05 mapping; LEI registration was lapsed and non-conforming. Newer corporate actions require new evidence.',
} as const

export const currentIdentityPolicy = {
  version: 'verified-equity-classes/2026-09-21.1',
  relationships: [alphabetRelationship, heicoRelationship],
} as const

/** Retain the exact original policy payload for immutable pre-HEICO checkpoints. */
export function identityPolicyEvidence(version: string): typeof alphabetRelationship | typeof currentIdentityPolicy | null {
  if (version === alphabetRelationship.version) return alphabetRelationship
  if (version === currentIdentityPolicy.version) return currentIdentityPolicy
  return null
}

export function issuerGroups(rows: readonly CompanyExposure[], policyVersion: string = currentIdentityPolicy.version) {
  const policy = identityPolicyEvidence(policyVersion)
  if (!policy) throw Error('Unsupported identity policy version')
  const relationships = 'relationships' in policy ? policy.relationships : [policy]
  return relationships.flatMap(relationship => {
    const eligible = rows.filter(row => relationship.securities.some(security => security.isin === row.isin))
    return [...new Set(eligible.map(row => row.currency))].map(currency => {
      const members = eligible.filter(row => row.currency === currency)
      const hasValue = members.some(row => row.contributions.some(contribution => contribution.value !== null))
      const sum = (key: 'direct' | 'indirect' | 'knownTotal') => hasValue
        ? members.reduce((total, row) => total.add(row[key]), new D(0)).toFixed() : null
      return { issuerId: relationship.issuerId, name: relationship.name, currency,
        knownTotal: sum('knownTotal'), direct: sum('direct'), indirect: sum('indirect'),
        unknownContributions: members.flatMap(row => row.contributions).filter(contribution => contribution.value === null).length,
        members, evidence: relationship,
        measure: 'Known monetary subtotal across verified equity classes; already included in security totals' }
    })
  })
}
