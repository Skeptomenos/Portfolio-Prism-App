/**
 * ActionQueue Component
 * 
 * Displays a prioritized list of data quality issues (unresolved items, failures).
 * Users can see what's broken and take action (e.g., upload CSV, contribute to Hive).
 */

import GlassCard from '../../GlassCard';
import type { PipelineHealthReport, PipelineFailure } from '../../../hooks/usePipelineDiagnostics';
import './ActionQueue.css';

// =============================================================================
// Types
// =============================================================================

interface ActionQueueProps {
  report: PipelineHealthReport | null;
  onAction?: (action: string, item: PipelineFailure) => void;
}

// =============================================================================
// Severity Badge Helper
// =============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; className: string }> = {
    ERROR: { label: 'Error', className: 'severity-error' },
    WARNING: { label: 'Warning', className: 'severity-warning' },
    INFO: { label: 'Info', className: 'severity-info' },
  };

  const cfg = config[severity?.toUpperCase()] || config.WARNING;

  return <span className={`severity-badge ${cfg.className}`}>{cfg.label}</span>;
}

// =============================================================================
// Component
// =============================================================================

export default function ActionQueue({ report, onAction }: ActionQueueProps) {
  const failures = report?.failures || [];

  if (failures.length === 0) {
    return (
      <GlassCard style={{ padding: '24px', textAlign: 'center' }}>
        <div className="action-queue-empty">
          <span className="empty-icon">✓</span>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            No issues found. All data resolved successfully.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="action-queue-wrapper">
      <div className="action-queue-header">
        <h4>Data Quality Issues</h4>
        <span className="issue-count">{failures.length} issues</span>
      </div>
      <div className="action-queue-list">
        {failures.map((failure, idx) => (
          <div key={`${failure.item}-${idx}`} className="action-queue-item">
            <div className="item-header">
              <SeverityBadge severity={failure.severity} />
              <span className="item-stage">{failure.stage.replace(/_/g, ' ')}</span>
            </div>
            <div className="item-content">
              <div className="item-name">{failure.item}</div>
              <div className="item-error">{failure.error || (failure as any).issue}</div>
              {failure.fix && (
                <div className="item-fix-hint">
                  💡 {failure.fix}
                </div>
              )}
            </div>
            <div className="item-actions">
              <button 
                className="action-button action-primary"
                onClick={() => onAction?.('fix', failure)}
              >
                Fix
              </button>
              <button 
                className="action-button action-secondary"
                onClick={() => onAction?.('ignore', failure)}
              >
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
