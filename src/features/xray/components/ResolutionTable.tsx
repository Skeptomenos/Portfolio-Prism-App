/**
 * ResolutionTable Component
 *
 * Displays the ETF decomposition results: which ETFs were resolved, by what source, and with how many holdings.
 */

import GlassCard from '../../../components/GlassCard'
import type { PipelineHealthReport } from '../types'
import './ResolutionTable.css'

// =============================================================================
// Types
// =============================================================================

interface ResolutionTableProps {
  report: PipelineHealthReport | null
}

// =============================================================================
// Status Badge Helper
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    complete: { label: '✓ Resolved', className: 'status-success' },
    success: { label: '✓ Resolved', className: 'status-success' },
    partial: { label: '⚠ Partial', className: 'status-warning' },
    failed: { label: '✕ Failed', className: 'status-error' },
    empty: { label: '— Empty', className: 'status-muted' },
  }

  const cfg = config[status] || config.empty

  return <span className={`resolution-status-badge ${cfg.className}`}>{cfg.label}</span>
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return <span className="resolution-source-badge source-unknown">Unknown</span>

  const sourceLabels: Record<string, string> = {
    hive: '🐝 Hive',
    cache: '💾 Cached',
    cached: '💾 Cached',
    adapter: '🔌 Adapter',
    amundi_adapter: '🔌 Amundi',
    ishares_adapter: '🔌 iShares',
    vanguard_adapter: '🔌 Vanguard',
  }

  const label = sourceLabels[source.toLowerCase()] || `🔌 ${source}`
  const className = source.toLowerCase().includes('hive')
    ? 'source-hive'
    : source.toLowerCase().includes('cache')
      ? 'source-cache'
      : 'source-adapter'

  return <span className={`resolution-source-badge ${className}`}>{label}</span>
}

// =============================================================================
// Component
// =============================================================================

export default function ResolutionTable({ report }: ResolutionTableProps) {
  const etfRows = report?.decomposition?.per_etf || []

  if (etfRows.length === 0) {
    return (
      <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>
          No ETF resolution data available. Run analysis to generate.
        </p>
      </GlassCard>
    )
  }

  return (
    <div className="resolution-table-wrapper">
      <table className="resolution-table">
        <thead>
          <tr>
            <th>ETF / ISIN</th>
            <th>Status</th>
            <th>Source</th>
            <th>Holdings</th>
            <th>Weight Sum</th>
          </tr>
        </thead>
        <tbody>
          {etfRows.map((etf, idx) => (
            <tr key={etf.isin || idx}>
              <td className="etf-name-cell">
                <div className="etf-name" style={{ fontSize: '14px', fontWeight: 500 }}>
                  {etf.name || 'Unknown'}
                </div>
                <div className="etf-ticker" style={{ fontSize: '11px', opacity: 0.7 }}>
                  {etf.isin}
                </div>
              </td>
              <td>
                <StatusBadge status={etf.status} />
              </td>
              <td>
                <SourceBadge source={etf.source} />
              </td>
              <td className="numeric-cell">{etf.holdings_count.toLocaleString()}</td>
              <td className="numeric-cell">{etf.weight_sum?.toFixed(1) ?? '0.0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
