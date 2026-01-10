import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  RefreshCcw,
  Clock,
  Upload,
  Shield,
  Eye,
  Send,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import {
  getPipelineReport,
  runPipeline,
  getRecentReports,
  getPendingReviews,
  setHiveContribution,
  getHiveContribution,
} from '../../lib/ipc'
import type { SystemLogReport } from '../../types'
import {
  useAppStore,
  useTelemetryMode,
  useSetTelemetryMode,
  useHiveContributionEnabled,
  useSetHiveContributionEnabled,
} from '../../store/useAppStore'
import HoldingsUpload from '../HoldingsUpload'

interface DataQualityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  code: string
  message: string
  fix_hint: string
  item: string
  phase: string
  timestamp?: string
  expected?: string
  actual?: string
}

interface DataQuality {
  quality_score: number
  is_trustworthy: boolean
  total_issues: number
  by_severity: Record<string, number>
  by_category: Record<string, number>
  issues: DataQualityIssue[]
}

interface HealthData {
  timestamp: string
  metrics: {
    direct_holdings: number
    etf_positions: number
    etfs_processed: number
    tier1_resolved: number
    tier1_failed: number
  }
  performance: {
    execution_time_seconds: number
    hive_hit_rate: number
    api_fallback_rate: number
    total_assets_processed: number
    phase_durations: Record<string, number>
  }
  etf_stats: {
    ticker: string
    holdings_count: number
    weight_sum: number
    status: string
  }[]
  failures: {
    severity: string
    stage: string
    item: string
    error: string
    fix: string
  }[]
  data_quality?: DataQuality
}

const HealthView = () => {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentReports, setRecentReports] = useState<SystemLogReport[]>([])
  const [pendingReviews, setPendingReviews] = useState<any[]>([])
  const [uploadModal, setUploadModal] = useState<{ isOpen: boolean; isin: string; ticker: string }>(
    {
      isOpen: false,
      isin: '',
      ticker: '',
    }
  )
  const setLastPipelineRun = useAppStore((state) => state.setLastPipelineRun)
  const telemetryMode = useTelemetryMode()
  const setTelemetryMode = useSetTelemetryMode()
  const hiveContributionEnabled = useHiveContributionEnabled()
  const setHiveContributionEnabled = useSetHiveContributionEnabled()

  const loadHealth = async () => {
    try {
      setLoading(true)
      const [content, reports, pending] = await Promise.all([
        getPipelineReport(),
        getRecentReports(),
        getPendingReviews(),
      ])
      setHealth(content)
      setRecentReports(reports)
      setPendingReviews(pending)
      setError(null)
    } catch (err) {
      console.error('Failed to load health report:', err)
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHealth()
    getHiveContribution().then(setHiveContributionEnabled)
  }, [])

  const handleRunAnalysis = async () => {
    try {
      setLoading(true)
      const result = await runPipeline()
      setLastPipelineRun(Date.now())
      await loadHealth()
      if (!result.success) {
        setError('Pipeline failed to run completely.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline execution failed')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Never'
    return new Date(isoString).toLocaleString()
  }

  const getQualityColor = () => {
    if (!health?.data_quality) return 'gray'
    if (health.data_quality.is_trustworthy) return 'green'
    if (health.data_quality.quality_score > 0.7) return 'orange'
    return 'red'
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '64px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            System Health
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Status of the analytics engine, data processing, and telemetry.
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCcw size={18} className={loading ? 'spin' : ''} />
          {loading ? 'Running...' : 'Run Diagnostics'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            marginBottom: '32px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Telemetry Settings */}
      <div
        style={{
          marginBottom: '32px',
          padding: '24px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
              }}
            >
              <Shield size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>
                Automatic Error Reporting
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Help improve Portfolio Prism by reporting anonymized errors.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {(['auto', 'review', 'off'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTelemetryMode(mode)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  border: 'none',
                  cursor: 'pointer',
                  background: telemetryMode === mode ? '#3b82f6' : 'transparent',
                  color: telemetryMode === mode ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {pendingReviews.length > 0 && telemetryMode === 'review' && (
          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              background: 'rgba(245, 158, 11, 0.05)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Clock size={16} />
                {pendingReviews.length} Reports Waiting for Review
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Send All
                </button>
                <button
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss All
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingReviews.slice(0, 3).map((log, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    [{log.category}] {log.message}
                  </span>
                  <div style={{ display: 'flex', gap: '12px', flexShrink: 0, marginLeft: '12px' }}>
                    <Eye size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} />
                    <Send size={14} style={{ cursor: 'pointer', color: '#3b82f6' }} />
                    <Trash2 size={14} style={{ cursor: 'pointer', color: '#ef4444' }} />
                  </div>
                </div>
              ))}
              {pendingReviews.length > 3 && (
                <span
                  style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}
                >
                  + {pendingReviews.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {recentReports.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                marginBottom: '12px',
              }}
            >
              Recent Reports (Last 7 Days)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {recentReports.slice(0, 4).map((report, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}
                    >
                      {(report.category ?? 'unknown').replace('_', ' ').toUpperCase()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {report.reported_at
                        ? new Date(report.reported_at).toLocaleDateString()
                        : 'N/A'}{' '}
                      • {report.component ?? 'unknown'}
                    </div>
                  </div>
                  <ExternalLink size={14} style={{ color: '#3b82f6', cursor: 'pointer' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hive Community Contribution */}
      <div className="mb-8 p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl ${hiveContributionEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-gray-400'}`}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Hive Community Contribution</h2>
              <p className="text-gray-400 text-sm max-w-md">
                Share anonymized ETF holdings and ticker mappings to help other users. No personal
                data is ever shared.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              const newValue = !hiveContributionEnabled
              setHiveContributionEnabled(newValue)
              setHiveContribution(newValue)
            }}
            className={`relative w-[52px] h-7 rounded-full border-none cursor-pointer transition-colors duration-200 ${hiveContributionEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-[left] duration-200 ${hiveContributionEnabled ? 'left-[26px]' : 'left-0.5'}`}
            />
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        <StatusCard
          label="Last Run"
          value={formatDate(health?.timestamp)}
          icon={Clock}
          color="blue"
        />
        <StatusCard
          label="Hive Hit Rate"
          value={health?.performance ? `${health.performance.hive_hit_rate}%` : '0%'}
          icon={CheckCircle}
          color="green"
        />
        <StatusCard
          label="Telemetry"
          value={telemetryMode.toUpperCase()}
          icon={Shield}
          color={telemetryMode === 'off' ? 'red' : telemetryMode === 'review' ? 'orange' : 'blue'}
        />
        <StatusCard
          label="Active Errors"
          value={health?.failures.length || 0}
          icon={health?.failures.length ? AlertCircle : CheckCircle}
          color={health?.failures.length ? 'red' : 'green'}
        />
        <StatusCard
          label="Data Quality"
          value={
            health?.data_quality ? `${Math.round(health.data_quality.quality_score * 100)}%` : 'N/A'
          }
          icon={health?.data_quality?.is_trustworthy ? CheckCircle : AlertCircle}
          color={getQualityColor()}
        />
      </div>

      {/* Error List */}
      {health?.failures && health.failures.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Active Issues
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {health.failures.map((fail, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  gap: '16px',
                }}
              >
                <AlertCircle size={24} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <h3 style={{ fontWeight: '600', marginBottom: '4px', color: '#ef4444' }}>
                    {fail.stage}: {fail.item}
                  </h3>
                  <p style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{fail.error}</p>
                  <div
                    style={{
                      display: 'inline-block',
                      background: 'rgba(239, 68, 68, 0.1)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#ef4444',
                      fontWeight: '500',
                    }}
                  >
                    Fix: {fail.fix}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ETF Breakdown */}
      {health?.etf_stats && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            ETF Decomposition Status
          </h2>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '16px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      color: 'var(--text-secondary)',
                      fontWeight: '500',
                    }}
                  >
                    Ticker
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      color: 'var(--text-secondary)',
                      fontWeight: '500',
                    }}
                  >
                    Holdings Found
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '16px',
                      color: 'var(--text-secondary)',
                      fontWeight: '500',
                    }}
                  >
                    Total Weight
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '16px',
                      color: 'var(--text-secondary)',
                      fontWeight: '500',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.etf_stats.map((etf, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                    <td style={{ padding: '16px' }}>{etf.ticker}</td>
                    <td style={{ padding: '16px' }}>{etf.holdings_count}</td>
                    <td style={{ padding: '16px' }}>{etf.weight_sum.toFixed(1)}%</td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '12px',
                        }}
                      >
                        {etf.status !== 'complete' && (
                          <button
                            onClick={() =>
                              setUploadModal({ isOpen: true, isin: etf.ticker, ticker: etf.ticker })
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              borderRadius: '8px',
                              color: '#3b82f6',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                            }}
                          >
                            <Upload size={14} />
                            Upload
                          </button>
                        )}
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background:
                              etf.status === 'complete'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(239, 68, 68, 0.2)',
                            color: etf.status === 'complete' ? '#10b981' : '#ef4444',
                          }}
                        >
                          {etf.status === 'complete' ? 'Ready' : 'Missing Data'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data Quality Section */}
      <DataQualitySection dataQuality={health?.data_quality} />

      <HoldingsUpload
        isOpen={uploadModal.isOpen}
        onClose={() => setUploadModal({ ...uploadModal, isOpen: false })}
        etfIsin={uploadModal.isin}
        etfTicker={uploadModal.ticker}
        onSuccess={loadHealth}
      />
    </div>
  )
}

const StatusCard = ({ label, value, icon: Icon, color }: any) => {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
    green: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' },
    orange: { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' },
    red: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' },
    gray: { bg: 'rgba(156, 163, 175, 0.1)', text: '#9ca3af' },
  }

  const theme = colors[color] || colors.blue

  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{label}</span>
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            background: theme.bg,
            color: theme.text,
          }}
        >
          <Icon size={20} />
        </div>
      </div>
      <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{value}</span>
    </div>
  )
}

const getSeverityColor = (severity: string) => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' }
    case 'high':
      return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b' }
    case 'medium':
      return { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' }
    case 'low':
      return { bg: 'rgba(156, 163, 175, 0.15)', border: '#9ca3af', text: '#9ca3af' }
    default:
      return { bg: 'rgba(156, 163, 175, 0.15)', border: '#9ca3af', text: '#9ca3af' }
  }
}

const QualityIssueCard = ({ issue }: { issue: DataQualityIssue }) => {
  const colors = getSeverityColor(issue.severity)
  return (
    <div
      style={{
        padding: '16px',
        background: colors.bg,
        borderRadius: '12px',
        border: `1px solid ${colors.border}30`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            fontSize: '11px',
            fontWeight: '600',
            textTransform: 'uppercase',
          }}
        >
          {issue.severity}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{issue.phase}</span>
        <span style={{ fontSize: '13px', fontWeight: '600', fontFamily: 'monospace' }}>
          {issue.code}
        </span>
      </div>
      <div style={{ fontSize: '14px', marginBottom: '8px' }}>{issue.message}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Affected:</span>
        <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{issue.item}</span>
      </div>
      <div
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: '6px',
          background: 'rgba(6, 182, 212, 0.15)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          color: '#06b6d4',
          fontSize: '12px',
        }}
      >
        {issue.fix_hint}
      </div>
    </div>
  )
}

const DataQualitySection = ({ dataQuality }: { dataQuality?: DataQuality }) => {
  if (!dataQuality || dataQuality.total_issues === 0) {
    return (
      <div
        style={{
          marginTop: '32px',
          padding: '24px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <CheckCircle size={20} style={{ color: '#10b981' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Data Quality</h3>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px',
            gap: '12px',
          }}
        >
          <CheckCircle size={48} style={{ color: '#10b981' }} />
          <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            No data quality issues detected
          </span>
        </div>
      </div>
    )
  }

  const scorePercent = Math.round(dataQuality.quality_score * 100)
  const scoreColor = dataQuality.is_trustworthy
    ? '#10b981'
    : dataQuality.quality_score > 0.7
      ? '#f59e0b'
      : '#ef4444'

  const getUserMessage = () => {
    if (dataQuality.is_trustworthy) {
      return "Your data is trustworthy. Minor issues detected but they don't affect analysis accuracy."
    }
    const criticalCount = dataQuality.issues.filter((i) => i.severity === 'critical').length
    const highCount = dataQuality.issues.filter((i) => i.severity === 'high').length
    if (criticalCount > 0) {
      return `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} detected. Please address these before relying on analysis results.`
    }
    if (highCount > 0) {
      return `${highCount} high-priority issue${highCount > 1 ? 's' : ''} may affect analysis accuracy.`
    }
    return 'Some data quality issues detected. Review and address as needed.'
  }

  const severityOrder = ['critical', 'high', 'medium', 'low'] as const
  const groupedIssues = severityOrder
    .map((severity) => ({
      severity,
      issues: dataQuality.issues.filter((i) => i.severity === severity),
    }))
    .filter((group) => group.issues.length > 0)

  return (
    <div
      style={{
        marginTop: '32px',
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <AlertCircle size={20} style={{ color: scoreColor }} />
        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Data Quality</h3>
        <span
          style={{
            marginLeft: '8px',
            padding: '4px 12px',
            borderRadius: '12px',
            background: `${scoreColor}20`,
            color: scoreColor,
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          {scorePercent}%
        </span>
      </div>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        {getUserMessage()}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {groupedIssues.map((group) => (
          <div key={group.severity}>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                marginBottom: '8px',
                textTransform: 'uppercase',
              }}
            >
              {group.severity} ({group.issues.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {group.issues.map((issue, idx) => (
                <QualityIssueCard key={`${issue.code}-${idx}`} issue={issue} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HealthView
