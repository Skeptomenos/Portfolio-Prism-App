/**
 * X-Ray Feature Types
 *
 * Shared pipeline/report contracts are re-exported from the global types
 * module so X-Ray components do not maintain their own duplicate interfaces.
 */

export type {
  ETFResolutionDetail,
  DecompositionSummary,
  EnrichmentStats,
  HiveLog,
  EnrichmentInfo,
  PerformanceMetrics,
  PipelineFailure,
  ETFStats,
  DataQualityIssue,
  DataQuality,
  PipelineHealthReport,
  PipelineReportEnvelope,
} from '../../types'

// =============================================================================
// UI Types
// =============================================================================

export type TabKey = 'resolution' | 'actions' | 'hive'

export interface TabConfig {
  key: TabKey
  label: string
  icon: string
}

export type { XRayHolding, ResolutionSummary, TrueHoldingsResponse } from '../dashboard/schemas'

export {
  XRayHoldingSchema,
  ResolutionSummarySchema,
  TrueHoldingsResponseSchema,
  ResolutionStatusSchema,
} from '../dashboard/schemas'

export type { ResolutionStatus, ResolutionSource } from '../../types'
