import { it, expect } from 'vitest'
import { TRAuthError } from 'trade-republic-sdk'
import {
  catalog,
  extractData,
  sanitizePayload,
  type DataSource,
  type ExplorerTransport,
} from '../server/explorer'
import { SnapshotStore } from '../server/store'
const signal = () => new AbortController().signal
const quiet = () => {}
const source = (id: string, payload: DataSource['payload']): DataSource => ({
  ...catalog.find((s) => s.id === id)!,
  status: 'success',
  payload,
  fetchedAt: '2026-01-01T00:00:00Z',
})
it('removes credentials and capability URLs recursively while preserving financial fields', () => {
  expect(
    sanitizePayload({
      quantity: '1e-8',
      account: 'synthetic',
      nested: { accessToken: 'SECRET', url: 'https://example.com/doc?access=SECRET' },
      pin: '1234',
    })
  ).toEqual({
    quantity: '1e-8',
    account: 'synthetic',
    nested: {
      accessToken: '[credential omitted]',
      url: '[URL omitted: may grant access to a private document]',
    },
    pin: '[credential omitted]',
  })
})
it('does not mutate prior history on later page failure, and persists source evidence', async () => {
  const old = source('timelineTransactions', { items: [{ id: 'old' }], nextCursor: 'next' })
  const initial = JSON.stringify(old),
    saved: DataSource[] = []
  let calls = 0
  const transport: ExplorerTransport = {
    read: async (id) => {
      if (id === 'timelineTransactions') {
        if (calls++ === 0) return { items: [{ id: 'new' }], cursors: { after: 'later' } }
        throw Error('private provider message')
      }
      return { sections: [] }
    },
  }
  await extractData(transport, [old], (s) => saved.push(s), signal(), 'continue', quiet)
  expect(JSON.stringify(old)).toBe(initial)
  expect(saved[0]).toMatchObject({
    status: 'failed',
    payload: old.payload,
    fetchedAt: old.fetchedAt,
  })
  expect(JSON.stringify(saved)).not.toContain('private provider message')
})
it('continues past individual detail failures and retains per-item outcomes', async () => {
  const saved: DataSource[] = []
  await extractData(
    {
      read: async (id, args) => {
        if (id === 'timelineTransactions')
          return { items: [{ id: 'bad' }, { id: 'good' }], cursors: {} }
        if (args.id === 'bad') throw Error('private')
        return { id: 'good', sections: [] }
      },
    },
    [],
    (s) => saved.push(s),
    signal(),
    'continue',
    quiet
  )
  const details = saved.find((s) => s.id === 'timelineDetails')!
  expect(details.status).toBe('partial')
  expect(JSON.stringify(details.payload)).toContain('good')
  expect(JSON.stringify(details.payload)).toContain('unexpected')
})
it('stops extraction on authentication rejection after saving safe failure evidence', async () => {
  let calls = 0
  const saved: DataSource[] = []
  await expect(
    extractData(
      {
        read: async () => {
          calls++
          throw new TRAuthError('secret')
        },
      },
      [],
      (s) => saved.push(s),
      signal(),
      'refresh',
      quiet
    )
  ).rejects.toBeInstanceOf(TRAuthError)
  expect(calls).toBe(1)
  expect(saved[0].error?.category).toBe('authentication')
})
it('does not save a late result after cancellation', async () => {
  const controller = new AbortController()
  const saved: DataSource[] = []
  await expect(
    extractData(
      {
        read: async () => {
          controller.abort()
          return { private: 'late' }
        },
      },
      [],
      (s) => saved.push(s),
      controller.signal,
      'refresh',
      quiet
    )
  ).rejects.toThrow()
  expect(saved).toEqual([])
})
it('marks bounded history as partial and continues without duplicate events', async () => {
  const saved: DataSource[] = []
  let pages = 0
  const transport: ExplorerTransport = {
    read: async (id) =>
      id === 'timelineTransactions'
        ? { items: [{ id: 'repeated' }], cursors: { after: `page-${++pages}` } }
        : { sections: [] },
  }
  await extractData(transport, [], (s) => saved.push(s), signal(), 'continue', quiet)
  expect(pages).toBe(10)
  expect(saved[0].status).toBe('partial')
  expect(saved[0].payload).toEqual({ items: [{ id: 'repeated' }], nextCursor: 'page-10' })
})
it('stores source snapshots separately from holdings and filters diagnostic source identifiers', () => {
  const store = new SnapshotStore(':memory:')
  store.saveSource(source('cash', [{ amount: 123, currencyId: 'EUR' }]))
  expect(store.sources().find((s) => s.id === 'cash')?.payload).toEqual([
    { amount: 123, currencyId: 'EUR' },
  ])
  expect(store.latest()).toBeNull()
  store.recordDiagnostic({
    attemptId: 'synthetic',
    sourceId: 'PRIVATE_ACCOUNT_ID',
    operation: 'sync',
    stage: 'data_extraction',
    event: 'failed',
    at: 'now',
    durationMs: 0,
    category: 'unexpected',
  })
  expect(store.diagnostics()[0].sourceId).toBeUndefined()
  store.close()
})

it('refresh merges new history with older records and retains the prior continuation cursor', async () => {
  const old = source('timelineTransactions', {
    items: [{ id: 'old', title: 'before' }, { id: 'older' }],
    nextCursor: 'older-cursor',
  })
  const saved: DataSource[] = []
  await extractData(
    {
      read: async (id) => {
        if (id === 'timelineTransactions')
          return {
            items: [{ id: 'new' }, { id: 'old', title: 'updated' }],
            cursors: { after: 'head-cursor' },
          }
        return {}
      },
    },
    [old],
    (s) => saved.push(s),
    signal(),
    'refresh',
    quiet
  )
  expect(saved.find((s) => s.id === 'timelineTransactions')?.payload).toEqual({
    items: [{ id: 'old', title: 'updated' }, { id: 'older' }, { id: 'new' }],
    nextCursor: 'older-cursor',
  })
  expect(old.payload).toEqual({
    items: [{ id: 'old', title: 'before' }, { id: 'older' }],
    nextCursor: 'older-cursor',
  })
})

it('persists extracted records across database reopen', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'prism-source-test-')),
    path = join(dir, 'db.sqlite')
  let store = new SnapshotStore(path)
  try {
    store.saveSource(source('cash', [{ amount: 42, currencyId: 'EUR' }]))
    store.close()
    store = new SnapshotStore(path)
    expect(store.sources().find((s) => s.id === 'cash')?.payload).toEqual([
      { amount: 42, currencyId: 'EUR' },
    ])
  } finally {
    store.close()
    rmSync(dir, { recursive: true })
  }
})
