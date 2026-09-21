// Complete legacy API comparison on identical copied data. No mutation or refresh.
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
const equal = (a: unknown, b: unknown, label = 'financial projection') => { if (!isDeepStrictEqual(a, b)) throw Error(`Mismatch: ${label}; private payload omitted`) }
import { createHash } from 'node:crypto'
import { createFinancialClient } from '../web/views/financial-client'
const [baseline, candidate] = process.argv.slice(2)
if (!baseline || !candidate) throw Error('Supply baseline and candidate isolated origins')
for (const origin of [baseline, candidate]) {
  const url = new URL(origin)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || ['4336', '4344'].includes(url.port)) throw Error('Use isolated copied-data origins')
}
async function read(origin: string, path: string) { const r = await fetch(origin + path); assert.equal(r.status, 200, path); return r.json() }
let comparisons = 0
async function compare(path: string, generatedClock = false) {
  const [before, after] = await Promise.all([read(baseline, path), read(candidate, path)])
  // Only Development's request-generation timestamp changes between independent reads.
  if (generatedClock) { delete before.generatedAt; delete after.generatedAt }
  equal(after, before, path); comparisons++; return after
}
const overview = await compare('/api/overview')
const exposure = await compare('/api/exposure')
const coverage = await compare('/api/coverage')
const development = await compare('/api/development', true)
for (const fund of development.funds) await compare('/api/development/etf/' + fund.isin)
let cursor: string | null = null
let checkpoints = 0
const checkpointHashes: string[] = []
do {
  const page = await compare('/api/history/runs?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))
  for (const run of page.items) {
    const detail = await compare('/api/history/runs/' + run.id)
    for (const checkpoint of detail.checkpoints) {
      const saved = await compare('/api/history/checkpoints/' + checkpoint.id)
      checkpointHashes.push(createHash('sha256').update(JSON.stringify(saved)).digest('hex')); checkpoints++
    }
  }
  cursor = page.nextCursor
} while (cursor)
const client = createFinancialClient((path, options) => fetch(candidate + path, options)), signal = new AbortController().signal
equal(await client.overview(signal), overview)
equal(await client.coverage(signal), coverage)
const projected = await client.exposure(signal)
equal(projected.rows, exposure.rows)
equal(projected.gaps, exposure.gaps)
equal(projected.issuerGroups, exposure.issuerGroups)
const sourceProjection = (source: Record<string, unknown> | null) => {
  if (!source) return null
  const { sourceRows: _redundantInspectionRows, ...retained } = source
  return retained
}
equal(projected, { ...exposure, composition: sourceProjection(exposure.composition), compositions: exposure.compositions.map(sourceProjection) }, 'complete exposure projection')
const progress = await client.development(signal)
const { directory: _directory, manifestFile: _manifestFile, ...evidence } = development.evidence
const { generatedAt: _generatedAt, ...projectedProgress } = progress
equal(projectedProgress, { ...development, evidence }, 'complete development projection')
for (const fund of development.funds) equal(await client.fund(fund.isin, signal), await read(candidate, '/api/development/etf/' + fund.isin), 'complete fund projection ' + fund.isin)
equal(await client.diagnostics(signal), await read(candidate, '/api/diagnostics'), 'complete diagnostics projection')
const analysis = await client.analysis(signal)
equal(analysis.data.exposure, projected)
equal(analysis.data.coverage, coverage)
console.log(JSON.stringify({ result: 'PASS', comparisons, checkpoints, positions: overview.rows.length,
  contributions: exposure.rows.flatMap((r: { contributions: unknown[] }) => r.contributions).length,
  checkpointDigest: createHash('sha256').update(checkpointHashes.join('\n')).digest('hex'),
  excludedComparisonField: 'development.generatedAt (request clock only)' }))
