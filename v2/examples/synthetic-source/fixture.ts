/** Synthetic source bytes. No HTTP, credentials or private captures. Not production registration. */
import { sourceHash, ProviderError, type ProviderContext, type ProviderEvidence, compositionPolicyVersion, compositionContractVersion } from '../../sdk/server'
import { exampleFundIsin } from './metadata'
import { exampleProvider, exampleUrl } from './server'
export function exampleEvidence(date = '2026-09-20'): ProviderEvidence {
  const bytes = Buffer.from(JSON.stringify({ fundIsin: exampleFundIsin, date, completeness: 'complete', weightUnit: 'percent',
    rows: [{ isin: 'US0378331005', name: 'Synthetic Alpha', weightPercent: '60.123456789012345678' },
      { isin: 'US67066G1040', name: 'Synthetic Beta', weightPercent: '39.876543210987654322' }] }))
  return { policyVersion: compositionPolicyVersion, format: 'composition-evidence/1', providerId: exampleProvider.manifest.id,
    providerVersion: exampleProvider.manifest.version, contractVersion: compositionContractVersion, parserVersion: exampleProvider.manifest.parserVersion,
    fundIsin: exampleFundIsin, publicationDate: date, artifacts: [{ role: 'holdings', url: exampleUrl,
      retrievedAt: '2026-09-21T10:00:00.000Z', status: 200, contentType: 'application/json', bytes: bytes.length,
      sha256: sourceHash(bytes), body: bytes.toString('base64') }] }
}
export function exampleContext(signal: AbortSignal): ProviderContext {
  return { signal, get: async (url, role) => {
    signal.throwIfAborted()
    if (url !== exampleUrl || role !== 'holdings') throw new ProviderError('access')
    return exampleEvidence().artifacts[0]
  } }
}
