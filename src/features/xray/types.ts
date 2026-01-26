/**
 * X-Ray Feature Types
 *
 * Types specific to the pipeline diagnostics and X-Ray operations view.
 */

// =============================================================================
// Pipeline Diagnostics Types
// =============================================================================

export interface ETFResolutionDetail {
  isin: string
  name: string
  holdings_count: number
  weight_sum?: number
  status: 'success' | 'partial' | 'failed'
  source?: string
}

export interface DecompositionSummary {
  etfs_processed: number
  etfs_failed: number
  total_underlying: number
  per_etf: ETFResolutionDetail[]
}

export interface EnrichmentStats {
  hive_hits: number
  api_calls: number
  new_contributions: number
}

export interface HiveLog {
  contributions: string[]
  hits: string[]
}

export interface EnrichmentInfo {
  stats: EnrichmentStats
  hive_log?: HiveLog
}

export interface PerformanceMetrics {
  execution_time_seconds: number
  phase_durations: Record<string, number>
  hive_hit_rate: number
  api_fallback_rate: number
  total_assets_processed: number
}

export interface PipelineFailure {
  severity: string
  stage: string
  item: string
  error: string
  fix?: string
}

export interface PipelineHealthReport {
  timestamp: string
  metrics: {
    direct_holdings: number
    etf_positions: number
    etfs_processed: number
    tier1_resolved: number
    tier1_failed: number
  }
  performance: PerformanceMetrics
  failures: PipelineFailure[]
  decomposition?: DecompositionSummary
  enrichment?: EnrichmentInfo
}

// =============================================================================
// UI Types
// =============================================================================

export type TabKey = 'resolution' | 'actions' | 'hive'

export interface TabConfig {
  key: TabKey
  label: string
  icon: string
}

// Re-export types from global types that are used by this feature
export type {
  XRayHolding,
  ResolutionStatus,
  ResolutionSource,
  ResolutionSummary,
  TrueHoldingsResponse,
} from '../../types'
