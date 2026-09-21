import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { SnapshotStore } from '../server/store'
import { currentIdentityPolicy } from '../server/issuer-relationships'

// Produced by unmodified main9150ac3e using synthetic holdings and quotes only.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/history-alphabet-v1.json', import.meta.url), 'utf8'))
it('replays original Alphabet-only checkpoints unchanged alongside new HEICO checkpoints after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prism-identity-policy-')), path = join(dir, 'portfolio.sqlite')
  let store = new SnapshotStore(path)
  store.close()
  const db = new DatabaseSync(path)
  for (const [table, rows] of Object.entries(fixture.tables)) {
    db.exec(`DELETE FROM ${table}`)
    for (const row of rows as Record<string, string | number | null>[]) {
      const columns = Object.keys(row)
      db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row))
    }
  }
  db.close()
  try {
    store = new SnapshotStore(path)
    const old = store.history.replay(fixture.checkpointId)
    expect(old).toEqual(fixture.expected)
    expect(old.result.issuerGroups).toHaveLength(1)
    const run = store.history.start('broker-sync')
    const next = store.history.capture(run, 'valuation', undefined, Date.parse('2026-09-21T10:00:01Z'))!
    store.history.finish(run, 'succeeded')
    const current = store.history.replay(next.checkpoint.id)
    expect(current.detail.versions.identity).toBe(currentIdentityPolicy.version)
    expect(current.result.issuerGroups).toHaveLength(2)
    expect(current.result.issuerGroups.find(group => group.name === 'HEICO Corporation')?.knownTotal).toBe('4.2469135780246913578')
    const withoutGroups = ({ issuerGroups: _groups, ...rest }: typeof current.result) => rest
    expect(withoutGroups(current.result)).toEqual(withoutGroups(old.result))
    store.close(); store = new SnapshotStore(path)
    expect(store.history.replay(fixture.checkpointId)).toEqual(fixture.expected)
    expect(store.history.replay(next.checkpoint.id)).toEqual(current)
    store.close()
    // A supported version cannot replay with a different, internally rehashed identity record.
    const corrupt = new DatabaseSync(path)
    const saved = String(corrupt.prepare('SELECT manifest FROM history_checkpoints WHERE id=?').get(next.checkpoint.id)!.manifest)
    const manifest = JSON.parse(inflateRawSync(Buffer.from(saved.slice(8), 'base64')).toString())
    manifest.identity.relationships = []
    const changed = JSON.stringify(manifest)
    corrupt.prepare('UPDATE history_checkpoints SET manifest=?,manifest_sha256=? WHERE id=?').run(changed, createHash('sha256').update(changed).digest('hex'), next.checkpoint.id)
    corrupt.close(); store = new SnapshotStore(path)
    expect(store.history.checkpoint(next.checkpoint.id)?.replay.reason).toContain('identity policy differs')
    expect(() => store.history.replay(next.checkpoint.id)).toThrow('Checkpoint replay unavailable')
    store.close()
    const restore = new DatabaseSync(path)
    restore.prepare('UPDATE history_checkpoints SET manifest=?,manifest_sha256=? WHERE id=?').run(saved, createHash('sha256').update(saved).digest('hex'), next.checkpoint.id)
    restore.close()
    // Even an internally rehashed unsupported version must not silently use current policy.
    const edit = new DatabaseSync(path)
    const payload = JSON.parse(String(edit.prepare('SELECT payload FROM history_checkpoints WHERE id=?').get(next.checkpoint.id)!.payload))
    payload.versions.identity = 'unknown-identity/999'
    const body = JSON.stringify(payload)
    edit.prepare('UPDATE history_checkpoints SET payload=?,sha256=? WHERE id=?').run(body, createHash('sha256').update(body).digest('hex'), next.checkpoint.id)
    edit.close(); store = new SnapshotStore(path)
    expect(store.history.checkpoint(next.checkpoint.id)?.replay.state).toBe('unavailable')
    expect(() => store.history.replay(next.checkpoint.id)).toThrow('Checkpoint replay unavailable')
    expect(store.history.replay(fixture.checkpointId)).toEqual(fixture.expected)
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})
