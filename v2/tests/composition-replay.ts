// Local evidence runner. Pass a PRIVATE database path and an ignored output path.
// --refresh retrieves only public composition; it never contacts the broker.
import { writeFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { Decimal } from 'decimal.js'
import { SnapshotStore } from '../server/store'
import { CompositionService } from '../server/composition-service'
import { exposure } from '../server/exposure'
import { overview } from '../server/overview'
const D = Decimal.clone({ precision: 256 })
const [path, output, flag] = process.argv.slice(2)
if (!path || !output || (flag && flag !== '--refresh'))
  throw Error('Usage: tsx tests/composition-replay.ts PRIVATE_DB PRIVATE_REPORT [--refresh]')
let store = new SnapshotStore(path)
try {
  if (flag === '--refresh') {
    const service = new CompositionService(store)
    assert.equal(service.refresh(), true, 'Pilot must be owned')
    await service.settled()
    assert.equal(
      store.compositionAttempt()?.status,
      'success',
      'Source acquisition failed; inspect local diagnostics'
    )
    await service.close()
  }
  const c = store.composition()
  assert.ok(c, 'No saved composition')
  const now = Date.now()
  const view = () =>
    exposure(
      overview(store.latest(), store.sources(), now, store.quantityObservations()),
      store.composition(),
      store.compositionAttempt(),
      false,
      now
    )
  const first = view()
  for (const company of first.rows) {
    assert.equal(new D(company.direct).plus(company.indirect).toFixed(), company.knownTotal)
    for (const contribution of company.contributions)
      if (contribution.value !== null) {
        assert.equal(
          new D(contribution.positionValue!).mul(contribution.weightPercent).div(100).toFixed(),
          contribution.value
        )
      }
  }
  for (const group of first.coverage)
    assert.equal(
      new D(group.knownCompanyValue).plus(group.unresolvedValue).toFixed(),
      group.pricedSecurities
    )
  const mixed = first.rows.filter(
    (r) =>
      r.contributions.some((c) => c.kind === 'direct' && c.value !== null) &&
      r.contributions.some((c) => c.kind === 'etf' && c.value !== null)
  )
  assert.ok(mixed.length > 0, 'No real direct-plus-ETF example')
  store.close()
  store = new SnapshotStore(path)
  assert.deepEqual(view(), first, 'Offline restart replay differs')
  writeFileSync(
    output,
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), offlineRestartEqual: true, ...first },
      null,
      2
    ),
    { mode: 0o600 }
  )
  console.log(
    JSON.stringify({
      result: 'passed',
      fund: c.fundIsin,
      asOf: c.asOf,
      retrievedAt: c.retrievedAt,
      sha256: c.sha256,
      disclosedPercent: c.disclosedPercent,
      mixedCompanyCount: mixed.length,
      offlineRestartEqual: true,
    })
  )
} finally {
  store.close()
}
