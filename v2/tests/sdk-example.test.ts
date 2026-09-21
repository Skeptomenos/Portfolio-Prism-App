import { compositionConformance } from '../sdk/conformance/composition'
import { sourceHash, type ProviderEvidence, type ProviderErrorCode } from '../sdk/server'
import { examplePlugin } from '../examples/synthetic-source/server'
import { exampleContext, exampleEvidence } from '../examples/synthetic-source/fixture'
function alter(change: (value: Record<string, unknown>) => void): ProviderEvidence {
  const evidence = exampleEvidence(), artifact = evidence.artifacts[0]
  const value: Record<string, unknown> = JSON.parse(Buffer.from(artifact.body, 'base64').toString())
  change(value)
  const bytes = Buffer.from(JSON.stringify(value))
  artifact.body = bytes.toString('base64'); artifact.bytes = bytes.length; artifact.sha256 = sourceHash(bytes)
  return evidence
}
const rejection = (name: string, code: ProviderErrorCode, change: (value: Record<string, unknown>) => void) => ({ name, code, evidence: () => alter(change) })
compositionConformance({ plugin: examplePlugin, evidence: exampleEvidence, context: exampleContext, rejected: [
  rejection('malformed publication', 'format', v => { delete v.rows }),
  rejection('partial publication', 'partial', v => { v.completeness = 'partial' }),
  rejection('empty publication', 'partial', v => { v.completeness = 'empty'; v.rows = [] }),
  rejection('wrong source identity', 'identity', v => { v.fundIsin = 'IE00B4L5Y983' }),
  rejection('inconsistent source date', 'date', v => { v.date = '2026-09-19' }),
  rejection('fraction units', 'format', v => { v.weightUnit = 'fraction' }),
  rejection('duplicate security', 'duplicate', v => { v.rows = [
    { isin: 'US0378331005', name: 'Duplicate one', weightPercent: '60' },
    { isin: 'US0378331005', name: 'Duplicate two', weightPercent: '40' }] }),
  rejection('unbalanced original weights', 'weights', v => { v.rows = [{ isin: 'US0378331005', name: 'Incomplete', weightPercent: '60' }] }),
  { name: 'corrupt artifact hash', code: 'format', evidence: () => { const value = exampleEvidence(); value.artifacts[0].sha256 = '0'.repeat(64); return value } },
] })
