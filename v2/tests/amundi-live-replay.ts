import { existsSync } from 'node:fs'
import { amundiFundIsin } from '../server/amundi-provider'
import { ProviderRefreshService } from '../server/provider-refresh-service'
import { SnapshotStore } from '../server/store'

const database = process.env.PRISM_AMUNDI_REPLAY_DB
if (!database) throw new Error('Set PRISM_AMUNDI_REPLAY_DB to a private SQLite path before running this live check.')

const store = new SnapshotStore(database)
if (!store.latest()) {
  store.save({
    fetchedAt: new Date().toISOString(),
    positions: [{
      account: 'live-check',
      isin: amundiFundIsin,
      name: 'Amundi live inspection check',
      quantity: '1',
      instrumentType: 'fund',
      averageBuyIn: '1',
    }],
  })
}

const host = new ProviderRefreshService(store)
if (!host.refresh()) throw new Error('The live check did not schedule an Amundi refresh.')
await host.settled()
const live = store.selectedInspections().find(observation => observation.fundIsin === amundiFundIsin)
const attempt = store.providerAttempts()[amundiFundIsin]
await host.close()
store.close()

if (!live) {
  console.log(JSON.stringify({ state: 'live-failed', databaseExists: existsSync(database), attempt }))
  process.exitCode = 1
} else {
  const reopened = new SnapshotStore(database)
  const replay = reopened.selectedInspections().find(observation => observation.fundIsin === amundiFundIsin)
  const result = {
    state: 'live-and-replay-ok',
    databaseExists: existsSync(database),
    attempt: attempt ? { status: attempt.status, outcome: attempt.outcome, code: attempt.code, providerId: attempt.providerId } : null,
    fundIsin: live.fundIsin,
    asOf: live.asOf,
    reportedRows: live.totalReportedRows,
    substituteRows: live.rows.length,
    partialBenchmarkRows: live.benchmarkRows.length,
    responseSha256: live.responseSha256,
    replayed: replay?.responseSha256 === live.responseSha256,
    sourceUrl: live.sourceUrl,
  }
  console.log(JSON.stringify(result))
  reopened.close()
  if (!result.replayed) process.exitCode = 1
}
