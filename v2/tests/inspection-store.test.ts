import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SnapshotStore } from '../server/store'
import { bundledPluginRegistry, createPluginRegistry } from '../server/plugin-registry'
import { inspectionEvidence } from './inspection-fixture'

const attempt = {
  id: 'inspection-attempt',
  at: '2026-09-17T12:01:00.000Z',
  providerId: 'amundi-bundled',
  status: 'success' as const,
  code: null,
  outcome: 'updated' as const,
  resolution: 'saved',
}

describe('inspection evidence persistence and replay', () => {
  it.each(['REPLICATION_METHODOLOGY', 'BENCHMARK_NAME', 'BENCHMARK_TICKER', 'FUND_SWAP_COUNTERPART', 'SHARE_MARKETING_NAME'])('rejects same-date %s revisions and replays last good metadata', (field) => {
    const path = join(mkdtempSync(join(tmpdir(), 'prism-inspection-metadata-')), 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    const original = inspectionEvidence()
    store.saveInspectionEvidence(original, attempt)
    const accepted = store.selectedInspections()[0]
    const revised = inspectionEvidence()
    const body = JSON.parse(Buffer.from(revised.artifact.body, 'base64').toString('utf8'))
    body.products[0].characteristics[field] = 'Changed semantic metadata'
    const bytes = Buffer.from(JSON.stringify(body))
    revised.artifact = { ...revised.artifact, body: bytes.toString('base64'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    expect(() => store.saveInspectionEvidence(revised, attempt)).toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(store.inspectionEvidenceCount()).toBe(1)
    expect(store.selectedInspections()[0]).toEqual(accepted)
    store.close()
    const reopened = new SnapshotStore(path)
    expect(reopened.selectedInspections()[0]).toEqual(accepted)
    reopened.close()
  })

  it('keeps identical semantics unchanged across response formatting and offline replay', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'prism-inspection-format-')), 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    const original = inspectionEvidence()
    store.saveInspectionEvidence(original, attempt)
    const formatted = inspectionEvidence()
    const body = JSON.parse(Buffer.from(formatted.artifact.body, 'base64').toString('utf8'))
    const bytes = Buffer.from(JSON.stringify(body, null, 2))
    formatted.artifact = { ...formatted.artifact, body: bytes.toString('base64'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), retrievedAt: '2026-09-18T12:00:00Z' }
    expect(store.saveInspectionEvidence(formatted, attempt)).toBe('unchanged')
    expect(store.inspectionEvidenceCount()).toBe(1)
    store.close()
    const reopened = new SnapshotStore(path)
    expect(reopened.selectedInspections()[0].responseSha256).toBe(original.artifact.sha256)
    expect(reopened.selectedInspections()[0].retrievedAt).toBe(original.artifact.retrievedAt)
    reopened.close()
  })

  it('rejects rebound source URLs during offline SQLite replay', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'prism-inspection-url-')), 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    const evidence = inspectionEvidence()
    store.saveInspectionEvidence(evidence, attempt)
    store.close()
    evidence.sourceUrl = evidence.request.url = evidence.artifact.url = evidence.artifact.request!.url = 'https://example.invalid/not-amundi'
    const db = new DatabaseSync(path)
    db.prepare('UPDATE provider_inspections SET evidence = ?').run(JSON.stringify(evidence))
    db.close()
    const reopened = new SnapshotStore(path)
    expect(reopened.selectedInspections()).toEqual([])
    expect(reopened.inspectionWarnings['FR0010361683']).toContain('no valid observation')
    expect(reopened.inspectionEvidenceCount()).toBe(1)
    reopened.close()
  })

  it('stores inspection evidence separately from economic compositions and preserves source units', () => {
    const store = new SnapshotStore(':memory:')
    const evidence = inspectionEvidence()
    expect(store.saveInspectionEvidence(evidence, attempt)).toBe('updated')
    expect(store.inspectionEvidenceCount()).toBe(1)
    expect(store.selectedCompositions()).toEqual([])
    expect(store.selectedInspections()[0]).toMatchObject({
      fundIsin: 'FR0010361683',
      asOf: '2026-09-16',
      rows: expect.arrayContaining([expect.objectContaining({ weightUnit: 'fraction', scope: 'substitute-basket' })]),
      benchmarkRows: [expect.objectContaining({ scope: 'partial-benchmark' })],
    })
    expect(store.saveInspectionEvidence(evidence, { ...attempt, outcome: 'unchanged' })).toBe('unchanged')
    expect(store.inspectionEvidenceCount()).toBe(1)
    expect(store.providerAttempts()['FR0010361683']).toMatchObject({ outcome: 'unchanged' })
    store.close()
  })

  it('rejects same-date revisions while retaining the accepted observation', () => {
    const store = new SnapshotStore(':memory:')
    store.saveInspectionEvidence(inspectionEvidence(), attempt)
    expect(() => store.saveInspectionEvidence(inspectionEvidence('2026-09-16', true), attempt)).toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(store.inspectionEvidenceCount()).toBe(1)
    expect(store.selectedInspections()[0].rows[0].name).toBe('Synthetic Equity')
    store.close()
  })

  it('reopens the database and keeps raw accepted rows when the decoder is unavailable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-inspection-'))
    const path = join(directory, 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    const evidence = inspectionEvidence()
    store.saveInspectionEvidence(evidence, attempt)
    store.close()

    const unavailable = new SnapshotStore(path, createPluginRegistry([]))
    expect(unavailable.selectedInspections()).toEqual([])
    expect(unavailable.inspectionWarnings['FR0010361683']).toContain('no valid observation')
    unavailable.close()

    const reopened = new SnapshotStore(path, bundledPluginRegistry)
    expect(reopened.selectedInspections()[0].responseSha256).toBe(evidence.artifact.sha256)
    reopened.close()
  })

  it('migrates the inspection table without changing older provider tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'prism-inspection-schema-'))
    const path = join(directory, 'portfolio.sqlite')
    const store = new SnapshotStore(path)
    store.close()
    const db = new DatabaseSync(path)
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(13)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_inspections'").get()).toBeTruthy()
    db.close()
  })
})
