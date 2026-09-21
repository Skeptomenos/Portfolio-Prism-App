import { describe, expect, it, vi } from 'vitest'
import { createHistoryClient } from '../web/views/history-client'
import { syntheticCheckpointDetail, syntheticHistoryPage, syntheticRunDetail } from './fixtures/history-contract'

const signal = new AbortController().signal
const clientFor = (body: unknown, status = 200) => createHistoryClient(vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch)
describe('history view wire boundary', () => {
  it('preserves exact shared decimals, nulls, dates and independent valuation gaps', async () => {
    const detail = await clientFor(syntheticCheckpointDetail).checkpoint('synthetic-checkpoint-1', signal)
    expect(detail).toEqual(syntheticCheckpointDetail)
    expect(detail.checkpoint.currencies[0].coveragePercent).toBe('100')
    expect(detail.checkpoint.unvaluedPositionCount).toBe(1)
    expect(detail.positions[1].value).toBeNull()
    expect(await clientFor(syntheticHistoryPage).runs(null, signal)).toEqual(syntheticHistoryPage)
    expect(await clientFor(syntheticRunDetail).run('synthetic-run-1', signal)).toEqual(syntheticRunDetail)
  })
  it.each([404, 500])('does not turn HTTP %s into empty or fallback results', async status => {
    await expect(clientFor({ error: 'unavailable' }, status).runs(null, signal)).rejects.toThrow('History unavailable')
  })
  it.each([
    { ...syntheticHistoryPage, contractVersion: 'portfolio-history/2' },
    { ...syntheticHistoryPage, items: null },
    { ...syntheticCheckpointDetail, positions: [{ ...syntheticCheckpointDetail.positions[0], quantity: 10 }] },
    { ...syntheticCheckpointDetail, checkpoint: { ...syntheticCheckpointDetail.checkpoint, recordedAt: 'yesterday' } },
  ])('rejects incompatible or malformed data', async value => {
    const client = clientFor(value)
    await expect('positions' in value ? client.checkpoint('synthetic-checkpoint-1', signal) : client.runs(null, signal)).rejects.toThrow('History unavailable')
  })
  it('checks requested identity and uses encoded, scoped paths', async () => {
    await expect(clientFor(syntheticCheckpointDetail).checkpoint('different-id', signal)).rejects.toThrow('identity')
    await expect(clientFor({ ...syntheticRunDetail, checkpoints: [{ ...syntheticRunDetail.checkpoints[0], runId: 'other' }] }).run('synthetic-run-1', signal)).rejects.toThrow('identity')
    const request = vi.fn(async () => new Response(JSON.stringify(syntheticHistoryPage)))
    await createHistoryClient(request).runs('a&other=1', signal)
    expect(request.mock.calls[0]).toEqual(['/api/history/runs?limit=25&cursor=a%26other%3D1', { signal, headers: { Accept: 'application/json' } }])
  })
})
