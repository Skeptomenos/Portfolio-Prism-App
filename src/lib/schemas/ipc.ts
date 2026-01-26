/**
 * IPC Response Zod Schemas
 *
 * Runtime validation schemas for ALL IPC responses from Python sidecar.
 * These schemas enforce type safety at the IO boundary.
 *
 * @see specs/08-ipc-zod-validation.md
 */

import { z } from 'zod'

// =============================================================================
// Portfolio Sync Result
// =============================================================================

export const PortfolioSyncResultSchema = z.object({
  syncedPositions: z.number(),
  newPositions: z.number(),
  updatedPositions: z.number(),
  totalValue: z.number(),
  durationMs: z.number(),
})

export type PortfolioSyncResult = z.infer<typeof PortfolioSyncResultSchema>

// =============================================================================
// Position Data (Full Trade Republic Export)
// =============================================================================

export const InstrumentTypeSchema = z.enum([
  'stock',
  'etf',
  'crypto',
  'bond',
  'derivative',
  'other',
])

export const PositionSchema = z.object({
  isin: z.string(),
  name: z.string(),
  ticker: z.string().optional(),
  instrumentType: InstrumentTypeSchema,
  quantity: z.number(),
  avgBuyPrice: z.number(),
  currentPrice: z.number(),
  currentValue: z.number(),
  totalCost: z.number(),
  pnlEur: z.number(),
  pnlPercent: z.number(),
  weight: z.number(),
  currency: z.string(),
  notes: z.string().optional(),
  lastUpdated: z.string(),
})

export type Position = z.infer<typeof PositionSchema>

export const PositionsResponseSchema = z.object({
  positions: z.array(PositionSchema),
  totalValue: z.number(),
  totalCost: z.number(),
  totalPnl: z.number(),
  totalPnlPercent: z.number(),
  lastSyncTime: z.string().optional(),
})

export type PositionsResponse = z.infer<typeof PositionsResponseSchema>

// =============================================================================
// Upload Holdings Result
// =============================================================================

export const UploadHoldingsResultSchema = z.object({
  success: z.boolean(),
  holdingsCount: z.number(),
  totalWeight: z.number(),
  contributedToHive: z.boolean(),
  isin: z.string(),
  message: z.string().optional(),
})

export type UploadHoldingsResult = z.infer<typeof UploadHoldingsResultSchema>

// =============================================================================
// System Log Report
// =============================================================================

export const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'])

export const SystemLogReportSchema = z.object({
  id: z.number(),
  session_id: z.string(),
  timestamp: z.string(),
  level: LogLevelSchema,
  source: z.string(),
  component: z.string().nullable(),
  category: z.string().nullable(),
  message: z.string(),
  context: z.string().nullable(),
  error_hash: z.string().nullable(),
  processed: z.number(),
  reported_at: z.string().nullable(),
})

export type SystemLogReport = z.infer<typeof SystemLogReportSchema>

// =============================================================================
// Run Pipeline Result
// =============================================================================

export const RunPipelineResultSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.string()),
  durationMs: z.number(),
})

export type RunPipelineResult = z.infer<typeof RunPipelineResultSchema>

// =============================================================================
// Hive Contribution Result
// =============================================================================

export const HiveContributionResultSchema = z.object({
  enabled: z.boolean(),
})

export type HiveContributionResult = z.infer<typeof HiveContributionResultSchema>

// =============================================================================
// Stored Credentials Result
// =============================================================================

export const StoredCredentialsResultSchema = z.object({
  hasCredentials: z.boolean(),
  maskedPhone: z.string().nullable(),
})

export type StoredCredentialsResult = z.infer<typeof StoredCredentialsResultSchema>

// =============================================================================
// Pipeline Health Report (complex nested types)
// =============================================================================

export const ETFResolutionDetailSchema = z.object({
  isin: z.string(),
  name: z.string(),
  holdings_count: z.number(),
  weight_sum: z.number().optional(),
  status: z.enum(['success', 'partial', 'failed']),
  source: z.string().optional(),
})

export type ETFResolutionDetail = z.infer<typeof ETFResolutionDetailSchema>

export const DecompositionSummarySchema = z.object({
  etfs_processed: z.number(),
  etfs_failed: z.number(),
  total_underlying: z.number(),
  per_etf: z.array(ETFResolutionDetailSchema),
})

export type DecompositionSummary = z.infer<typeof DecompositionSummarySchema>

export const EnrichmentStatsSchema = z.object({
  hive_hits: z.number(),
  api_calls: z.number(),
  new_contributions: z.number(),
})

export type EnrichmentStats = z.infer<typeof EnrichmentStatsSchema>

export const HiveLogSchema = z.object({
  contributions: z.array(z.string()),
  hits: z.array(z.string()),
})

export type HiveLog = z.infer<typeof HiveLogSchema>

export const EnrichmentInfoSchema = z.object({
  stats: EnrichmentStatsSchema,
  hive_log: HiveLogSchema.optional(),
})

export type EnrichmentInfo = z.infer<typeof EnrichmentInfoSchema>

export const PerformanceMetricsSchema = z.object({
  execution_time_seconds: z.number(),
  phase_durations: z.record(z.string(), z.number()),
  hive_hit_rate: z.number(),
  api_fallback_rate: z.number(),
  total_assets_processed: z.number(),
})

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>

export const PipelineFailureSchema = z.object({
  severity: z.string(),
  stage: z.string(),
  item: z.string(),
  error: z.string(),
  fix: z.string().optional(),
})

export type PipelineFailure = z.infer<typeof PipelineFailureSchema>

export const ETFStatsSchema = z.object({
  ticker: z.string(),
  holdings_count: z.number(),
  weight_sum: z.number(),
  status: z.string(),
})

export type ETFStats = z.infer<typeof ETFStatsSchema>

export const DataQualityIssueSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  code: z.string(),
  message: z.string(),
  fix_hint: z.string(),
  item: z.string(),
  phase: z.string(),
  timestamp: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
})

export type DataQualityIssue = z.infer<typeof DataQualityIssueSchema>

export const DataQualitySchema = z.object({
  quality_score: z.number(),
  is_trustworthy: z.boolean(),
  total_issues: z.number(),
  by_severity: z.record(z.string(), z.number()),
  by_category: z.record(z.string(), z.number()),
  issues: z.array(DataQualityIssueSchema),
})

export type DataQuality = z.infer<typeof DataQualitySchema>

export const PipelineHealthReportSchema = z.object({
  timestamp: z.string(),
  metrics: z.object({
    direct_holdings: z.number(),
    etf_positions: z.number(),
    etfs_processed: z.number(),
    tier1_resolved: z.number(),
    tier1_failed: z.number(),
  }),
  performance: PerformanceMetricsSchema,
  failures: z.array(PipelineFailureSchema),
  decomposition: DecompositionSummarySchema.optional(),
  enrichment: EnrichmentInfoSchema.optional(),
  etf_stats: z.array(ETFStatsSchema).optional(),
  data_quality: DataQualitySchema.optional(),
})

export type PipelineHealthReport = z.infer<typeof PipelineHealthReportSchema>
