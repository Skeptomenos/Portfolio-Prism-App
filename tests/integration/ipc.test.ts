import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getEngineHealth, getPipelineReport } from '../../src/lib/ipc'
import {
  server,
  startPythonSidecar,
  stopPythonSidecar,
  writePipelineHealthReport,
} from './setup'

describe('IPC integration', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    await startPythonSidecar()
  })

  afterAll(async () => {
    await stopPythonSidecar()
    server.close()
  })

  it('fetches engine health from the real sidecar', async () => {
    const health = await getEngineHealth()

    expect(health.version).toBeDefined()
    expect(health.sessionId).toBeDefined()
  })

  it('fetches pipeline report from the real sidecar', async () => {
    const reportPayload = {
      timestamp: new Date().toISOString(),
      metrics: {
        direct_holdings: 0,
        etf_positions: 0,
        etfs_processed: 0,
        tier1_resolved: 0,
        tier1_failed: 0,
      },
      performance: {
        execution_time_seconds: 0.1,
        phase_durations: {},
        hive_hit_rate: 0,
        api_fallback_rate: 0,
        total_assets_processed: 0,
      },
      failures: [],
      data_quality: {
        quality_score: 1,
        is_trustworthy: true,
        total_issues: 0,
        by_severity: {},
        by_category: {},
        issues: [],
      },
    }

    await writePipelineHealthReport(reportPayload)
    const report = await getPipelineReport()

    expect(report.metrics).toEqual(reportPayload.metrics)
    expect(report.performance.total_assets_processed).toBe(0)
  })
})
