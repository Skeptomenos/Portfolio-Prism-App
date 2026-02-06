import type {
  DataQualityIssue,
  PipelineFailure,
  PipelineHealthReport,
  PipelineIssue,
  PipelineIssueSeverity,
} from '../types'

const DATA_QUALITY_SEVERITY_MAP: Record<DataQualityIssue['severity'], PipelineIssueSeverity> = {
  critical: 'ERROR',
  high: 'ERROR',
  medium: 'WARNING',
  low: 'INFO',
}

function normalizeFailureSeverity(severity: string): PipelineIssueSeverity {
  const normalized = severity.toUpperCase()
  if (normalized === 'ERROR' || normalized === 'CRITICAL' || normalized === 'HIGH') {
    return 'ERROR'
  }
  if (normalized === 'WARNING' || normalized === 'WARN' || normalized === 'MEDIUM') {
    return 'WARNING'
  }
  return 'INFO'
}

function mapDataQualityIssue(issue: DataQualityIssue): PipelineIssue {
  return {
    severity: DATA_QUALITY_SEVERITY_MAP[issue.severity] ?? 'WARNING',
    stage: issue.phase,
    item: issue.item,
    error: issue.message,
    fix: issue.fix_hint,
    code: issue.code,
    category: issue.category,
    source: 'data_quality',
  }
}

function mapFailureIssue(failure: PipelineFailure): PipelineIssue {
  return {
    severity: normalizeFailureSeverity(failure.severity),
    stage: failure.stage,
    item: failure.item,
    error: failure.error,
    fix: failure.fix,
    code: failure.issue,
    category: 'legacy',
    source: 'pipeline_failure',
  }
}

export function getPipelineIssues(report: PipelineHealthReport | null): PipelineIssue[] {
  if (!report) {
    return []
  }

  const dataQualityIssues = report.data_quality?.issues ?? []
  if (dataQualityIssues.length > 0) {
    return dataQualityIssues.map(mapDataQualityIssue)
  }

  return (report.failures ?? []).map(mapFailureIssue)
}
