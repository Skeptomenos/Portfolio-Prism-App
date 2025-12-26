/**
 * Pipeline Diagnostics Hook
 * 
 * Fetches the pipeline health report JSON for the X-Ray Operations view.
 * This provides data for the PipelineStepper, ResolutionTable, ActionQueue, etc.
 */

import { useQuery } from '@tanstack/react-query';
import { getPipelineReport } from '../lib/ipc';

// =============================================================================
// Types
// =============================================================================

export interface ETFResolutionDetail {
  isin: string;
  name: string;
  holdings_count: number;
  status: 'success' | 'partial' | 'failed';
  source?: string; // e.g., 'amundi_adapter', 'hive', 'cached'
}

export interface DecompositionSummary {
  etfs_processed: number;
  etfs_failed: number;
  total_underlying: number;
  per_etf: ETFResolutionDetail[];
}

export interface EnrichmentStats {
  hive_hits: number;
  api_calls: number;
  new_contributions: number;
}

export interface HiveLog {
  contributions: string[];
  hits: string[];
}

export interface EnrichmentInfo {
  stats: EnrichmentStats;
  hive_log?: HiveLog;
}

export interface PerformanceMetrics {
  execution_time_seconds: number;
  phase_durations: Record<string, number>;
  hive_hit_rate: number;
  api_fallback_rate: number;
  total_assets_processed: number;
}

export interface PipelineFailure {
  severity: string;
  stage: string;
  item: string;
  error: string;
  fix?: string;
}

export interface PipelineHealthReport {
  timestamp: string;
  metrics: {
    direct_holdings: number;
    etf_positions: number;
    etfs_processed: number;
    tier1_resolved: number;
    tier1_failed: number;
  };
  performance: PerformanceMetrics;
  etf_stats: Array<{
    ticker: string;
    holdings_count: number;
    weight_sum: number;
    status: string;
  }>;
  failures: PipelineFailure[];
  // New fields added by backend upgrade
  decomposition?: DecompositionSummary;
  enrichment?: EnrichmentInfo;
}

// =============================================================================
// Hook
// =============================================================================

export function usePipelineDiagnostics() {
  return useQuery({
    queryKey: ['pipelineDiagnostics'],
    queryFn: async (): Promise<PipelineHealthReport> => {
      return await getPipelineReport();
    },
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });
}
