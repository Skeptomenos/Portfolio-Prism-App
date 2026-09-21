// Offline qualification only. Does not acquire sources, open a database or admit holdings.
import { writeFileSync } from 'node:fs'
import { qualifyRetainedIusa } from './iusa-evidence'
const [directory, output] = process.argv.slice(2)
if (!directory || !output || process.argv.length !== 4) throw Error('Usage: tsx server/qualify-iusa.ts PRIVATE_EVIDENCE_DIR NEW_PRIVATE_REPORT')
const report = qualifyRetainedIusa(directory)
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ state: report.state, eligibleForMonetaryExposure: report.eligibleForMonetaryExposure,
  asOf: report.candidate?.asOf ?? null, rows: report.candidate?.accounting.sourceRows ?? null,
  checks: report.checks.map(({ id, state }) => ({ id, state })) }))
process.exitCode = report.state === 'ready' ? 0 : report.state === 'open' ? 2 : 1
