import { useMemo } from 'react';
import GlassCard from '../GlassCard';
import UnresolvedIsinsList from './UnresolvedIsinsList';
import { PipelineSummaryData } from '../../hooks/usePipelineProgress';
import './PipelineSummaryCard.css';

// =============================================================================
// Types
// =============================================================================

interface PipelineSummaryCardProps {
  summary: PipelineSummaryData | null;
  isVisible: boolean;
  onDismiss?: () => void;
}

interface PhaseTimingConfig {
  key: string;
  label: string;
  color: string;
}

const PHASE_COLORS: PhaseTimingConfig[] = [
  { key: 'loading', label: 'Load', color: '#3b82f6' },
  { key: 'decomposition', label: 'Decompose', color: '#22d3ee' },
  { key: 'enrichment', label: 'Enrich', color: '#10b981' },
  { key: 'aggregation', label: 'Aggregate', color: '#a855f7' },
];

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  return `${seconds.toFixed(1)}s`;
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return 'emerald';
  if (rate >= 80) return 'cyan';
  return 'red';
}

// =============================================================================
// Component
// =============================================================================

export default function PipelineSummaryCard({ 
  summary, 
  isVisible, 
  onDismiss 
}: PipelineSummaryCardProps) {
  
  // Calculate success rate
  const successRate = useMemo(() => {
    if (!summary) return 0;
    const { resolved, total } = summary.resolution;
    return total > 0 ? Math.round((resolved / total) * 100) : 100;
  }, [summary]);

  // Calculate phase timing percentages
  const phaseTimings = useMemo(() => {
    if (!summary?.timing.phases) return [];
    
    const totalTime = summary.timing.total_seconds;
    if (totalTime === 0) return [];

    return PHASE_COLORS.map(phase => {
      const duration = summary.timing.phases[phase.key] || 0;
      const percentage = (duration / totalTime) * 100;
      return {
        ...phase,
        duration,
        percentage: Math.max(percentage, 2), // Minimum 2% for visibility
      };
    }).filter(phase => phase.duration > 0);
  }, [summary]);

  if (!isVisible || !summary) {
    return null;
  }

  const rateColorClass = getSuccessRateColor(successRate);

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      <div className="pipeline-summary-card">
        {/* Header */}
        <div className="summary-header">
          <div className="summary-title">
            <span className="summary-icon">◈</span>
            <span>Analysis Summary</span>
          </div>
          {onDismiss && (
            <button className="dismiss-button" onClick={onDismiss} aria-label="Dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Summary Cards Grid */}
        <div className="summary-grid">
          {/* Holdings Card */}
          <div className="summary-stat-card">
            <div className="stat-header">
              <span className="stat-icon holdings">◇</span>
              <span className="stat-label">Holdings</span>
            </div>
            <div className="stat-content">
              <div className="stat-row">
                <span className="stat-key">Stocks</span>
                <span className="stat-value">{summary.holdings.stocks}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">ETFs</span>
                <span className="stat-value">{summary.holdings.etfs}</span>
              </div>
              <div className="stat-row primary">
                <span className="stat-key">Total Value</span>
                <span className="stat-value">{formatCurrency(summary.holdings.total_value)}</span>
              </div>
            </div>
          </div>

          {/* Decomposition Card */}
          <div className="summary-stat-card">
            <div className="stat-header">
              <span className="stat-icon decomposition">◆</span>
              <span className="stat-label">Decomposition</span>
            </div>
            <div className="stat-content">
              <div className="stat-row">
                <span className="stat-key">ETFs Processed</span>
                <span className="stat-value">{summary.decomposition.etfs_processed}</span>
              </div>
              <div className="stat-row">
                <span className="stat-key">Failed</span>
                <span className="stat-value warning">{summary.decomposition.etfs_failed}</span>
              </div>
              <div className="stat-row primary">
                <span className="stat-key">Underlying</span>
                <span className="stat-value">{summary.decomposition.total_underlying}</span>
              </div>
            </div>
          </div>

          {/* Resolution Card */}
          <div className="summary-stat-card">
            <div className="stat-header">
              <span className="stat-icon resolution">▣</span>
              <span className="stat-label">Resolution</span>
            </div>
            <div className="stat-content">
              <div className="resolution-rate">
                <span className={`rate-badge ${rateColorClass}`}>
                  {successRate}%
                </span>
                <span className="rate-detail">
                  {summary.resolution.resolved}/{summary.resolution.total} resolved
                </span>
              </div>
              {summary.resolution.skipped_tier2 > 0 && (
                <div className="stat-row muted">
                  <span className="stat-key">Skipped (low priority)</span>
                  <span className="stat-value">{summary.resolution.skipped_tier2}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phase Timing Section */}
        {phaseTimings.length > 0 && (
          <div className="timing-section">
            <div className="timing-header">
              <span className="timing-label">Phase Timing</span>
              <span className="timing-total">
                Completed in {formatTime(summary.timing.total_seconds)}
              </span>
            </div>
            <div className="timing-bar">
              {phaseTimings.map((phase, index) => (
                <div
                  key={phase.key}
                  className="timing-segment"
                  style={{
                    width: `${phase.percentage}%`,
                    backgroundColor: phase.color,
                    borderRadius: index === 0 
                      ? '4px 0 0 4px' 
                      : index === phaseTimings.length - 1 
                        ? '0 4px 4px 0' 
                        : '0',
                  }}
                  title={`${phase.label}: ${formatTime(phase.duration)}`}
                />
              ))}
            </div>
            <div className="timing-legend">
              {phaseTimings.map(phase => (
                <div key={phase.key} className="legend-item">
                  <span 
                    className="legend-dot" 
                    style={{ backgroundColor: phase.color }}
                  />
                  <span className="legend-label">{phase.label}</span>
                  <span className="legend-time">{formatTime(phase.duration)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unresolved Items List */}
        {summary.unresolved.length > 0 && (
          <UnresolvedIsinsList
            items={summary.unresolved}
            totalCount={summary.unresolved_total}
            isTruncated={summary.unresolved_truncated}
            skippedTier2Count={summary.resolution.skipped_tier2}
          />
        )}
      </div>
    </GlassCard>
  );
}
