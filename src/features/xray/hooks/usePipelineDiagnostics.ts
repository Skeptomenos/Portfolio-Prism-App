/**
 * Pipeline Diagnostics Hook
 *
 * Fetches the latest pipeline report envelope for the X-Ray operations view.
 * The UI must unwrap `ready` reports explicitly and handle `missing` / `invalid`
 * states without relying on validation exceptions.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getPipelineReport } from '@/lib/ipc'
import type {
  PipelineReportEnvelope,
  PipelineHealthReport,
  ETFResolutionDetail,
  EnrichmentInfo,
  PerformanceMetrics,
  PipelineFailure,
  DataQuality,
  DataQualityIssue,
} from '@/types'

export type {
  PipelineReportEnvelope,
  PipelineHealthReport,
  ETFResolutionDetail,
  EnrichmentInfo,
  PerformanceMetrics,
  PipelineFailure,
  DataQuality,
  DataQualityIssue,
} from '@/types'

export function usePipelineDiagnostics(): UseQueryResult<PipelineReportEnvelope, Error> {
  return useQuery({
    queryKey: ['pipelineDiagnostics'],
    queryFn: async (): Promise<PipelineReportEnvelope> => {
      return await getPipelineReport()
    },
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })
}
