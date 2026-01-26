import { describe, it, expect } from 'vitest'
import {
  PortfolioSyncResultSchema,
  PositionSchema,
  PositionsResponseSchema,
  UploadHoldingsResultSchema,
  SystemLogReportSchema,
  RunPipelineResultSchema,
  HiveContributionResultSchema,
  PipelineHealthReportSchema,
} from './ipc'

describe('PortfolioSyncResultSchema', () => {
  it('validates correct data', () => {
    const valid = {
      syncedPositions: 10,
      newPositions: 2,
      updatedPositions: 8,
      totalValue: 50000.0,
      durationMs: 1234,
    }
    expect(() => PortfolioSyncResultSchema.parse(valid)).not.toThrow()
  })

  it('rejects missing required fields', () => {
    const invalid = {
      syncedPositions: 10,
      newPositions: 2,
    }
    expect(() => PortfolioSyncResultSchema.parse(invalid)).toThrow()
  })
})

describe('PositionSchema', () => {
  it('validates correct data', () => {
    const valid = {
      isin: 'US0378331005',
      name: 'Apple Inc.',
      ticker: 'AAPL',
      instrumentType: 'stock',
      quantity: 10,
      avgBuyPrice: 150.0,
      currentPrice: 175.0,
      currentValue: 1750.0,
      totalCost: 1500.0,
      pnlEur: 250.0,
      pnlPercent: 16.67,
      weight: 0.05,
      currency: 'USD',
      lastUpdated: '2026-01-26T10:00:00Z',
    }
    expect(() => PositionSchema.parse(valid)).not.toThrow()
  })

  it('rejects invalid instrumentType', () => {
    const invalid = {
      isin: 'US0378331005',
      name: 'Apple Inc.',
      instrumentType: 'invalid_type',
      quantity: 10,
      avgBuyPrice: 150.0,
      currentPrice: 175.0,
      currentValue: 1750.0,
      totalCost: 1500.0,
      pnlEur: 250.0,
      pnlPercent: 16.67,
      weight: 0.05,
      currency: 'USD',
      lastUpdated: '2026-01-26T10:00:00Z',
    }
    expect(() => PositionSchema.parse(invalid)).toThrow()
  })
})

describe('PositionsResponseSchema', () => {
  it('validates correct data with positions array', () => {
    const valid = {
      positions: [
        {
          isin: 'US0378331005',
          name: 'Apple Inc.',
          instrumentType: 'stock',
          quantity: 10,
          avgBuyPrice: 150.0,
          currentPrice: 175.0,
          currentValue: 1750.0,
          totalCost: 1500.0,
          pnlEur: 250.0,
          pnlPercent: 16.67,
          weight: 0.05,
          currency: 'USD',
          lastUpdated: '2026-01-26T10:00:00Z',
        },
      ],
      totalValue: 1750.0,
      totalCost: 1500.0,
      totalPnl: 250.0,
      totalPnlPercent: 16.67,
    }
    expect(() => PositionsResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('UploadHoldingsResultSchema', () => {
  it('validates correct data', () => {
    const valid = {
      success: true,
      holdingsCount: 50,
      totalWeight: 98.5,
      contributedToHive: true,
      isin: 'IE00B4L5Y983',
      message: 'Holdings uploaded successfully',
    }
    expect(() => UploadHoldingsResultSchema.parse(valid)).not.toThrow()
  })

  it('accepts missing optional message', () => {
    const valid = {
      success: true,
      holdingsCount: 50,
      totalWeight: 100.0,
      contributedToHive: false,
      isin: 'IE00B4L5Y983',
    }
    expect(() => UploadHoldingsResultSchema.parse(valid)).not.toThrow()
  })
})

describe('SystemLogReportSchema', () => {
  it('validates correct data', () => {
    const valid = {
      id: 1,
      session_id: 'sess_12345',
      timestamp: '2026-01-26T10:00:00Z',
      level: 'ERROR',
      source: 'pipeline',
      component: 'enrichment',
      category: 'api_error',
      message: 'API rate limit exceeded',
      context: '{"retry_after": 60}',
      error_hash: 'abc123',
      processed: 0,
      reported_at: null,
    }
    expect(() => SystemLogReportSchema.parse(valid)).not.toThrow()
  })

  it('rejects invalid log level', () => {
    const invalid = {
      id: 1,
      session_id: 'sess_12345',
      timestamp: '2026-01-26T10:00:00Z',
      level: 'VERBOSE',
      source: 'pipeline',
      component: null,
      category: null,
      message: 'Test message',
      context: null,
      error_hash: null,
      processed: 0,
      reported_at: null,
    }
    expect(() => SystemLogReportSchema.parse(invalid)).toThrow()
  })
})

describe('RunPipelineResultSchema', () => {
  it('validates correct data', () => {
    const valid = {
      success: true,
      errors: [],
      durationMs: 5432,
    }
    expect(() => RunPipelineResultSchema.parse(valid)).not.toThrow()
  })

  it('validates with errors array', () => {
    const valid = {
      success: false,
      errors: ['Failed to fetch data', 'Invalid response'],
      durationMs: 1234,
    }
    expect(() => RunPipelineResultSchema.parse(valid)).not.toThrow()
  })
})

describe('HiveContributionResultSchema', () => {
  it('validates correct data', () => {
    expect(() => HiveContributionResultSchema.parse({ enabled: true })).not.toThrow()
    expect(() => HiveContributionResultSchema.parse({ enabled: false })).not.toThrow()
  })

  it('rejects non-boolean enabled', () => {
    expect(() => HiveContributionResultSchema.parse({ enabled: 'yes' })).toThrow()
  })
})

describe('PipelineHealthReportSchema', () => {
  it('validates correct minimal data', () => {
    const valid = {
      timestamp: '2026-01-26T10:00:00Z',
      metrics: {
        direct_holdings: 5,
        etf_positions: 3,
        etfs_processed: 3,
        tier1_resolved: 100,
        tier1_failed: 2,
      },
      performance: {
        execution_time_seconds: 5.5,
        phase_durations: { fetch: 1.0, enrich: 2.5, decompose: 2.0 },
        hive_hit_rate: 0.85,
        api_fallback_rate: 0.15,
        total_assets_processed: 105,
      },
      failures: [],
    }
    expect(() => PipelineHealthReportSchema.parse(valid)).not.toThrow()
  })

  it('validates data with optional fields', () => {
    const valid = {
      timestamp: '2026-01-26T10:00:00Z',
      metrics: {
        direct_holdings: 5,
        etf_positions: 3,
        etfs_processed: 3,
        tier1_resolved: 100,
        tier1_failed: 2,
      },
      performance: {
        execution_time_seconds: 5.5,
        phase_durations: {},
        hive_hit_rate: 0.85,
        api_fallback_rate: 0.15,
        total_assets_processed: 105,
      },
      failures: [
        {
          severity: 'high',
          stage: 'enrichment',
          item: 'US0378331005',
          error: 'API timeout',
          fix: 'Retry later',
        },
      ],
      decomposition: {
        etfs_processed: 3,
        etfs_failed: 0,
        total_underlying: 500,
        per_etf: [
          {
            isin: 'IE00B4L5Y983',
            name: 'iShares Core MSCI World',
            holdings_count: 1500,
            weight_sum: 100,
            status: 'success',
            source: 'provider',
          },
        ],
      },
    }
    expect(() => PipelineHealthReportSchema.parse(valid)).not.toThrow()
  })
})
