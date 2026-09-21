import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotStore } from '../server/store'
import { issuerBundle, issuerRaw, fixtureAt } from './issuer-fixture'

const funds = ['IE0031442068', 'IE00B4L5Y983'] as const
const importedAt = '2026-09-12T12:00:00Z'
const paths: string[] = []

function temporaryStore() {
  const directory = mkdtempSync(join(tmpdir(), 'portfolio-prism-multi-store-'))
  const path = join(directory, 'snapshot.sqlite')
  paths.push(directory)
  return { path, store: new SnapshotStore(path) }
}

function saveBoth(store: SnapshotStore) {
  for (const isin of funds) store.saveIssuerAllocation(issuerBundle(isin), importedAt)
}

afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('multi-fund issuer allocation persistence', () => {
  it('admits two funds and deduplicates repeated identical bundles', () => {
    const { store } = temporaryStore()
    for (const isin of funds) {
      const bundle = issuerBundle(isin)
      store.saveIssuerAllocation(bundle, importedAt)
      store.saveIssuerAllocation(bundle, importedAt)
    }

    expect(store.selectedCompositions().map(source => source.fundIsin)).toEqual([...funds].sort())
    expect(store.issuerAttempts()).toMatchObject({
      IE0031442068: { status: 'success', code: null },
      IE00B4L5Y983: { status: 'success', code: null },
    })
    store.close()
  })

  it('keeps both selected funds after one fund is tampered or conflicts semantically', () => {
    const { store } = temporaryStore()
    saveBoth(store)

    const tampered = issuerBundle(funds[0])
    tampered.captures[0].body = Buffer.from('tampered').toString('base64')
    expect(() => store.saveIssuerAllocation(tampered, importedAt)).toThrow(/Issuer import failed/)

    const semanticConflict = issuerBundle(funds[0], issuerRaw(funds[0]).replace('Synthetic equity A', 'Changed equity A'))
    expect(() => store.saveIssuerAllocation(semanticConflict, importedAt)).toThrow(/Issuer import failed/)

    expect(store.selectedCompositions().map(source => source.fundIsin)).toEqual([...funds].sort())
    expect(store.allocationWarnings).toEqual({})
    store.close()
  })

  it('restarts with exact compositions and original retrieval times', () => {
    const { path, store } = temporaryStore()
    saveBoth(store)
    const before = store.selectedCompositions()
    store.close()

    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()).toEqual(before)
    expect(restarted.selectedCompositions().map(source => source.retrievedAt)).toEqual([fixtureAt, fixtureAt])
    restarted.close()
  })

  it('falls back to the same fund’s prior valid row when its newest row is corrupt', () => {
    const { path, store } = temporaryStore()
    saveBoth(store)
    const original = store.selectedCompositions().find(source => source.fundIsin === funds[0])!
    store.close()

    const db = new DatabaseSync(path)
    db.prepare('INSERT INTO issuer_allocations VALUES (?,?,?,?,?)').run(
      funds[0],
      'f'.repeat(64),
      '2026-09-12',
      JSON.stringify({ corrupt: true }),
      '2026-09-13T12:00:00Z',
    )
    db.close()

    const restarted = new SnapshotStore(path)
    const selected = restarted.selectedCompositions()
    expect(selected).toEqual(expect.arrayContaining([
      original,
      expect.objectContaining({ fundIsin: funds[1] }),
    ]))
    expect(selected).toHaveLength(2)
    expect(restarted.allocationWarnings[funds[0]]).toBe('Newer evidence failed replay; previous valid issuer source retained.')
    expect(restarted.allocationWarnings[funds[1]]).toBeUndefined()
    restarted.close()
  })

  it.each([
    ['fund', (row: Record<string, unknown>) => { row.fund_isin = 'IE00B53SZB19' }],
    ['hash', (row: Record<string, unknown>) => { row.sha256 = '0'.repeat(64) }],
    ['date', (row: Record<string, unknown>) => { row.as_of = '2026-09-08' }],
  ])('rejects a stored %s mismatch', (_kind, mutate) => {
    const { path, store } = temporaryStore()
    store.saveIssuerAllocation(issuerBundle(funds[0]), importedAt)
    store.close()

    const db = new DatabaseSync(path)
    const row = db.prepare('SELECT fund_isin,sha256,as_of,bundle,imported_at FROM issuer_allocations').get() as Record<string, unknown>
    mutate(row)
    db.prepare('DELETE FROM issuer_allocations').run()
    db.prepare('INSERT INTO issuer_allocations VALUES (?,?,?,?,?)').run(
      String(row.fund_isin), String(row.sha256), String(row.as_of), String(row.bundle), String(row.imported_at),
    )
    db.close()

    const restarted = new SnapshotStore(path)
    expect(restarted.selectedCompositions()).toEqual([])
    expect(Object.values(restarted.allocationWarnings)).toHaveLength(1)
    expect(Object.values(restarted.allocationWarnings)[0]).toMatch(/Saved issuer evidence failed/)
    restarted.close()
  })

  it('rejects an unknown parser version before persisting', () => {
    const { store } = temporaryStore()
    const bundle = issuerBundle(funds[0])
    bundle.parserVersion = 'unknown-parser/999'
    expect(() => store.saveIssuerAllocation(bundle, importedAt)).toThrow(/Issuer import failed/)
    expect(store.selectedCompositions()).toEqual([])
    store.close()
  })
})
