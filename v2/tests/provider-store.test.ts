import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotStore } from '../server/store'
import { providerEvidence } from './provider-fixture'
import { sourceHash } from '../server/composition-admission'
import { issuerBundle, fixtureAt } from './issuer-fixture'

const paths: string[] = []
const attempt = (fundIsin: string) => ({ id: `attempt-${fundIsin}`, at: '2026-09-12T12:00:00Z', providerId: 'ishares-bundled', status: 'success' as const, code: null, outcome: 'updated' as const, resolution: 'saved' })
const validEvidence = providerEvidence
function temporaryStore() {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-prism-provider-'))
  paths.push(directory)
  const path = join(directory, 'snapshot.sqlite')
  return { path, store: new SnapshotStore(path) }
}
function legacyPilot(date = '01/09/2026') {
  const ids = ['US67066G1040','US0378331005','US5949181045','US0231351067','US02079K3059','US11135F1012','US02079K1079','US30303M1027','US5951121038','US46625H1005']
  return `<h1 data-testid="etf-profile-header_etf-name">iShares Core S&amp;P 500 UCITS ETF USD (Dist)</h1><span data-testid="etf-profile-header_isin-value">IE0031442068</span><h3 data-testid="hl_etf-holdings_top-holdings_header">Top 10 Holdings</h3><span data-testid="tl_etf-holdings_top-holdings_weight">10%</span><table data-testid="etf-holdings_top-holdings_table">${ids.map(id => `<tr><td><a href="/en/stock-profiles/${id}">Synthetic</a></td><td><span data-testid="tl_etf-holdings_top-holdings_value_percentage">1%</span></td></tr>`).join('')}</table><div data-testid="tl_etf-holdings_reference-date">As of ${date}</div>`
}
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe('provider evidence store', () => {
  it('persists and replays the NQSE estimate as its own exact fund source', () => {
    const { path, store } = temporaryStore()
    const evidence = validEvidence('IE00BYVQ9F29', '2026-09-10', ['99', '1'])
    expect(store.saveProviderEvidence(evidence, attempt(evidence.fundIsin))).toBe('updated')
    expect(store.selectedCompositions()).toHaveLength(1)
    expect(store.selectedCompositions()[0]).toMatchObject({
      fundIsin: 'IE00BYVQ9F29',
      measure: 'issuer-reported-allocation-estimate',
      asOf: '2026-09-10',
    })
    store.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()[0]).toMatchObject({
      fundIsin: 'IE00BYVQ9F29',
      asOf: '2026-09-10',
      estimateLimitation: { qualifier: expect.stringContaining('class hedge adjustment unknown') },
    })
    restarted.close()
  })

  it('selects the newest date, rejects older and conflicting same-date rows, and is idempotent', () => {
    const { path, store } = temporaryStore()
    const first = validEvidence('IE0031442068', '2026-09-10')
    expect(store.saveProviderEvidence(first, attempt(first.fundIsin))).toBe('updated')
    const metadataOnly = validEvidence('IE0031442068', '2026-09-10')
    metadataOnly.artifacts[0].retrievedAt = '2026-09-12T12:00:00.000Z'
    expect(store.saveProviderEvidence(metadataOnly, attempt(first.fundIsin))).toBe('unchanged')
    expect(store.providerCompositionCount()).toBe(1)
    expect(store.selectedCompositions()[0].retrievedAt).toBe('2026-09-11T12:00:00.000Z')

    const later = validEvidence('IE0031442068', '2026-09-11', ['98', '2'])
    expect(store.saveProviderEvidence(later, { ...attempt(first.fundIsin), outcome: 'updated' })).toBe('updated')
    expect(store.providerCompositionCount()).toBe(2)
    expect(store.selectedCompositions()[0].asOf).toBe('2026-09-11')
    expect(store.selectedCompositions()[0].sourceRows?.[0].weightPercent).toBe('98')

    expect(() => store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-10', ['98', '2']), attempt(first.fundIsin))).toThrow()
    expect(() => store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-09'), attempt(first.fundIsin))).toThrow()
    store.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()[0].asOf).toBe('2026-09-11')
    restarted.close()
  })

  it('restarts with the newest accepted source and its original retrieval metadata', () => {
    const { path, store } = temporaryStore()
    store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-10'), attempt('IE0031442068'))
    store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-11', ['98', '2']), { ...attempt('IE0031442068'), outcome: 'updated' })
    const before = store.selectedCompositions()
    store.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()).toEqual(before)
    expect(restarted.selectedCompositions()[0].asOf).toBe('2026-09-11')
    expect(restarted.selectedCompositions()[0].retrievedAt).toBe('2026-09-11T12:00:00.000Z')
    restarted.close()
  })

  it('keeps unrelated funds and the same fund prior source after newer corruption', () => {
    const { path, store } = temporaryStore()
    store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-10'), attempt('IE0031442068'))
    store.saveProviderEvidence(validEvidence('IE00B4L5Y983', '2026-09-10'), attempt('IE00B4L5Y983'))
    const original = store.selectedCompositions().find(source => source.fundIsin === 'IE0031442068')!
    store.close()
    const db = new DatabaseSync(path)
    db.prepare('INSERT INTO provider_compositions VALUES (?,?,?,?)').run('IE0031442068', 'f'.repeat(64), '2026-09-12', JSON.stringify({ corrupt: true }))
    db.close()

    const restarted = new SnapshotStore(path)
    const selected = restarted.selectedCompositions()
    expect(selected).toEqual(expect.arrayContaining([original, expect.objectContaining({ fundIsin: 'IE00B4L5Y983' })]))
    expect(selected).toHaveLength(2)
    expect(restarted.allocationWarnings.IE0031442068).toContain('previous valid composition retained')
    expect(restarted.allocationWarnings.IE00B4L5Y983).toBeUndefined()
    restarted.close()
  })

  it('deduplicates same-date rows when only metadata and retrieval differ', () => {
    const { store } = temporaryStore()
    const first = validEvidence('IE0031442068', '2026-09-10')
    store.saveProviderEvidence(first, attempt('IE0031442068'))
    const second = validEvidence('IE0031442068', '2026-09-10')
    const page = Buffer.from(second.artifacts[0].body, 'base64')
    const changedPage = Buffer.concat([page, Buffer.from('<!-- menu metadata changed -->')])
    second.artifacts[0].body = changedPage.toString('base64')
    second.artifacts[0].bytes = changedPage.length
    second.artifacts[0].sha256 = sourceHash(changedPage)
    second.artifacts[0].retrievedAt = '2026-09-12T12:00:00.000Z'
    second.artifacts[1].retrievedAt = '2026-09-12T12:00:00.000Z'
    expect(store.saveProviderEvidence(second, attempt('IE0031442068'))).toBe('unchanged')
    expect(store.providerCompositionCount()).toBe(1)
    expect(store.selectedCompositions()[0].retrievedAt).toBe('2026-09-11T12:00:00.000Z')
    store.close()
  })

  it.each(['identity', 'date', 'hash', 'policy', 'parser'] as const)('falls back after replay %s corruption', kind => {
    const { path, store } = temporaryStore()
    store.saveProviderEvidence(validEvidence('IE0031442068', '2026-09-10'), attempt('IE0031442068'))
    const valid = validEvidence('IE0031442068', '2026-09-10')
    const corrupt = structuredClone(valid)
    const rowFund = 'IE0031442068'
    let rowHash = 'f'.repeat(64)
    let rowDate = '2026-09-12'
    if (kind === 'identity') corrupt.fundIsin = 'IE00B4L5Y983'
    if (kind === 'date') rowDate = '2026-09-12'
    if (kind === 'hash') rowHash = '0'.repeat(64)
    if (kind === 'policy') corrupt.policyVersion = 'unknown-policy/999' as typeof corrupt.policyVersion
    if (kind === 'parser') corrupt.parserVersion = 'unknown-parser/999'
    store.close()
    const db = new DatabaseSync(path)
    db.prepare('INSERT INTO provider_compositions VALUES (?,?,?,?)').run(rowFund, rowHash, rowDate, JSON.stringify(corrupt))
    db.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()).toHaveLength(1)
    expect(restarted.selectedCompositions()[0].asOf).toBe('2026-09-10')
    expect(restarted.allocationWarnings[rowFund]).toContain('previous valid composition retained')
    restarted.close()
  })

  it.each([7, 8])('migrates schema %s to provider evidence tables', version => {
    const { path, store } = temporaryStore()
    if (version === 7) store.saveComposition(legacyPilot(), fixtureAt, { at: fixtureAt, id: 'legacy', status: 'success', code: null })
    else store.saveIssuerAllocation(issuerBundle('IE00B4L5Y983'), fixtureAt)
    store.close()
    const db = new DatabaseSync(path)
    db.exec('DROP TABLE history_checks; DROP TABLE history_checkpoints; DROP TABLE history_runs; DROP TABLE history_observations; DROP TABLE history_blobs; DROP TABLE history_meta; DROP TABLE provider_compositions; DROP TABLE provider_attempts;')
    if (version === 7) db.exec('DROP TABLE issuer_allocations; DROP TABLE issuer_attempts;')
    db.exec(`PRAGMA user_version=${version}`)
    db.close()
    const migrated = new SnapshotStore(path)
    expect(migrated.saveProviderEvidence(validEvidence(), attempt('IE0031442068'))).toBe('updated')
    expect(migrated.providerCompositionCount()).toBe(1)
    if (version === 7) expect(migrated.composition()).not.toBeNull()
    else expect(migrated.selectedCompositions().some(source => source.fundIsin === 'IE00B4L5Y983')).toBe(true)
    migrated.close()
  })

  it.each([7, 9])('promotes a same-date partial recovery source after schema %s replay and retains full-source conflict protection', version => {
    const { path, store } = temporaryStore()
    const isin = 'IE0031442068'
    store.saveComposition(legacyPilot('10/09/2026'), fixtureAt, { at: fixtureAt, id: 'legacy', status: 'success', code: null })
    const partial = store.selectedCompositions()[0]
    expect(partial).toMatchObject({ scope: 'top-ten', asOf: '2026-09-10', identifiedPercent: '10' })
    store.close()
    if (version === 7) {
      const db = new DatabaseSync(path)
      db.exec('DROP TABLE history_checks; DROP TABLE history_checkpoints; DROP TABLE history_runs; DROP TABLE history_observations; DROP TABLE history_blobs; DROP TABLE history_meta; DROP TABLE provider_compositions; DROP TABLE provider_attempts; DROP TABLE issuer_allocations; DROP TABLE issuer_attempts; PRAGMA user_version=7;')
      db.close()
    }
    const migrated = new SnapshotStore(path)
    expect(() => migrated.saveProviderEvidence(validEvidence(isin, '2026-09-09'), attempt(isin)))
      .toThrowError(expect.objectContaining({ code: 'date' }))
    expect(migrated.selectedCompositions()).toEqual([partial])
    expect(migrated.saveProviderEvidence(validEvidence(isin, '2026-09-10'), attempt(isin))).toBe('updated')
    const full = migrated.selectedCompositions()[0]
    expect(full).toMatchObject({ scope: 'full-holdings', asOf: '2026-09-10', identifiedPercent: '99' })
    expect(migrated.allocationWarnings[isin]).toBeUndefined()
    expect(migrated.providerCompositionCount()).toBe(1)
    expect(migrated.composition()).toEqual(partial)
    migrated.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()).toEqual([full])
    expect(restarted.composition()).toEqual(partial)
    expect(restarted.saveProviderEvidence(validEvidence(isin, '2026-09-10'), attempt(isin))).toBe('unchanged')
    expect(() => restarted.saveProviderEvidence(validEvidence(isin, '2026-09-10', ['98', '2']), attempt(isin)))
      .toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(restarted.providerCompositionCount()).toBe(1)
    expect(restarted.selectedCompositions()).toEqual([full])
    restarted.close()
  })

  it('persists safe provider attempt evidence across restart', () => {
    const { path, store } = temporaryStore()
    store.recordProviderAttempt('IE0031442068', { ...attempt('IE0031442068'), outcome: 'failed', status: 'failed', code: 'format', resolution: 'retry' })
    expect(store.providerAttempts().IE0031442068).toMatchObject({ status: 'failed', code: 'format', outcome: 'failed' })
    store.close()
    const restarted = new SnapshotStore(path)
    expect(restarted.providerAttempts().IE0031442068).toMatchObject({ status: 'failed', code: 'format' })
    restarted.close()
  })
})
