/** The first bundled-provider contract. Trusted modules; this is not a sandbox. */
export const compositionPolicyVersion = 'issuer-allocation/1' as const
export const compositionContractVersion = 'composition-provider/1' as const
export interface SourceCheck {
  id: string
  state: 'passed' | 'failed' | 'pending'
  detail: string
  evidence: string[]
}
export interface SourceRow {
  sourceRow: number
  name: string
  isin: string | null
  ticker: string | null
  assetClass: string
  weightPercent: string
  marketValue: string
  notionalValue: string
  currency: string
  exchange: string | null
  country: string | null
  identifierPresence: 'present' | 'missing'
  equityIdentity: 'valid-isin' | 'unresolved' | 'not-equity'
}
export interface SourceAccounting {
  sourceRows: number
  equityRows: number
  nonEquityRows: number
  validEquityIsins: number
  unresolvedEquityRows: number
  reportedPercent: string
  equityPercent: string
  nonEquityPercent: string
  marketValue: string
  notionalValue: string
  byAssetClass: { assetClass: string; rows: number; weightPercent: string; marketValue: string; notionalValue: string }[]
}
export interface ProviderManifest {
  id: string
  version: string
  contractVersion: string
  parserVersion: string
  capabilities: { discovery: 'direct-http'; funds: readonly string[] }
  sourceConstraints: { access: 'public-no-credentials'; retention: 'unsettled-private-use'; termsUrl: string }
}
export interface SourceArtifact {
  role: string
  url: string
  retrievedAt: string
  status: 200
  contentType: string
  bytes: number
  sha256: string
  body: string // Original bytes encoded as base64, private SQLite only.
  request?: ProviderRequest
}

export interface ProviderRequest {
  method: 'POST'
  url: string
  body: string
  sha256: string
}
export interface ProviderEvidence {
  policyVersion: typeof compositionPolicyVersion
  format: 'composition-evidence/1'
  providerId: string
  providerVersion: string
  contractVersion: typeof compositionContractVersion
  parserVersion: string
  fundIsin: string
  publicationDate: string
  artifacts: SourceArtifact[]
}
export interface CompositionCandidate {
  fundIsin: string
  fundName: string
  asOf: string
  retrievedAt: string
  sourceUrl: string
  termsUrl: string
  sha256: string
  parserVersion: string
  completeness: 'complete' | 'partial' | 'empty'
  weightUnit: 'percent'
  weightBasis: 'whole-published-holdings'
  measure: 'issuer-reported-allocation-estimate'
  estimateLimitation?: import('./composition').Composition['estimateLimitation']
  rows: SourceRow[]
  evidenceChecks: SourceCheck[]
}
export type AcquisitionResult =
  | { state: 'publication'; evidence: ProviderEvidence }
  | { state: 'partial' | 'empty'; diagnostic: ProviderErrorCode }
export interface ProviderContext {
  signal: AbortSignal
  get: (url: string, role: string, contentType: 'html' | 'json' | 'csv') => Promise<SourceArtifact>
  post?: (url: string, role: string, body: string) => Promise<SourceArtifact>
}
export interface CompositionProvider {
  manifest: ProviderManifest
  acquire: (fundIsin: string, context: ProviderContext) => Promise<AcquisitionResult>
  decode: (evidence: ProviderEvidence) => CompositionCandidate
}
export type ProviderErrorCode = 'access' | 'http' | 'timeout' | 'cancelled' | 'size' | 'discovery' | 'identity' | 'date' | 'format' | 'partial' | 'empty' | 'duplicate' | 'units' | 'weights' | 'version' | 'conflict' | 'storage' | 'network' | 'activation'
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly httpStatus?: number) { super(`Composition source ${code}`) }
}
export const providerResolution: Record<ProviderErrorCode, string> = {
  access: 'The public issuer route refused access. Keep saved data; check source availability without bypassing access controls.',
  http: 'The issuer request failed. Keep saved data and retry later; inspect the HTTP status.',
  timeout: 'The bounded refresh timed out. Keep saved data and retry when the issuer is available.',
  cancelled: 'Refresh was cancelled. Previously accepted compositions remain selected; retry when ready.',
  size: 'The response exceeded the reviewed size limit. Review the changed source format before retrying.',
  discovery: 'The exact publication could not be discovered. Review the issuer page binding and discovery parser.',
  identity: 'Fund or constituent identity could not be verified. Review the exact source profile and identifiers.',
  date: 'Publication dates are missing, inconsistent or older than the selected source. Review the dated evidence.',
  format: 'The issuer response format changed or was malformed. Update and verify its parser before admission.',
  partial: 'A complete compatible holdings publication was not established. Keep saved data and investigate missing rows or source scope.',
  empty: 'The source returned no usable rows. Keep saved data and investigate the exact fund route.',
  duplicate: 'Duplicate source rows or provider registrations were found. Resolve the conflict before admission.',
  units: 'The source weight unit or portfolio basis is unsupported. Obtain explicit compatible source semantics.',
  weights: 'The original weight checks failed. Investigate the source; never normalize it to force acceptance.',
  version: 'The provider contract or saved parser version is unsupported. Restore a compatible decoder before replay.',
  conflict: 'A publication conflicts with accepted same-date rows. Review the issuer correction before replacing it.',
  storage: 'Accepted source or attempt metadata could not be saved. Check local SQLite storage before retrying.',
  network: 'The public issuer connection failed. Keep saved data and retry when connectivity is restored.',
  activation: 'The provider could not activate. Keep accepted data and retry after the bundled capability is repaired or re-enabled.',
}

export interface ProviderAttempt {
  id: string
  at: string
  providerId: string
  status: 'success' | 'failed'
  code: ProviderErrorCode | null
  outcome: 'updated' | 'unchanged' | 'failed' | 'cancelled'
  resolution: string
  httpStatus?: number
}
