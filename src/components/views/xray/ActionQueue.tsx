import { useState } from 'react';
import GlassCard from '../../GlassCard';
import type { PipelineHealthReport, PipelineFailure } from '../../../hooks/usePipelineDiagnostics';
import './ActionQueue.css';

const IGNORED_ISSUES_KEY = 'portfolio-prism-ignored-issues';

function getIgnoredIssues(): Set<string> {
  try {
    const stored = localStorage.getItem(IGNORED_ISSUES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveIgnoredIssues(ignored: Set<string>): void {
  localStorage.setItem(IGNORED_ISSUES_KEY, JSON.stringify([...ignored]));
}

function getIssueKey(failure: PipelineFailure): string {
  return `${failure.stage}:${failure.item}:${failure.error || (failure as any).issue}`;
}

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
  const [ignoredIssues, setIgnoredIssues] = useState<Set<string>>(() => getIgnoredIssues());
  const [showIgnored, setShowIgnored] = useState(false);
  const [fixTooltip, setFixTooltip] = useState<string | null>(null);

  const allFailures = report?.failures || [];
  const visibleFailures = allFailures.filter(f => !ignoredIssues.has(getIssueKey(f)));
  const ignoredFailures = allFailures.filter(f => ignoredIssues.has(getIssueKey(f)));
  const displayedFailures = showIgnored ? ignoredFailures : visibleFailures;

  const handleIgnore = (failure: PipelineFailure) => {
    const key = getIssueKey(failure);
    const newIgnored = new Set(ignoredIssues);
    newIgnored.add(key);
    setIgnoredIssues(newIgnored);
    saveIgnoredIssues(newIgnored);
    onAction?.('ignore', failure);
  };

  const handleRestore = (failure: PipelineFailure) => {
    const key = getIssueKey(failure);
    const newIgnored = new Set(ignoredIssues);
    newIgnored.delete(key);
    setIgnoredIssues(newIgnored);
    saveIgnoredIssues(newIgnored);
  };

  const handleFixClick = (failure: PipelineFailure) => {
    setFixTooltip(getIssueKey(failure));
    setTimeout(() => setFixTooltip(null), 2000);
    onAction?.('fix', failure);
  };

  if (allFailures.length === 0) {
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
        <div className="header-controls">
          {ignoredFailures.length > 0 && (
            <button 
              className="toggle-ignored-btn"
              onClick={() => setShowIgnored(!showIgnored)}
            >
              {showIgnored ? `Show Active (${visibleFailures.length})` : `Show Ignored (${ignoredFailures.length})`}
            </button>
          )}
          <span className="issue-count">
            {showIgnored ? `${ignoredFailures.length} ignored` : `${visibleFailures.length} issues`}
          </span>
        </div>
      </div>
      
      {displayedFailures.length === 0 ? (
        <div className="action-queue-empty-state">
          <p style={{ color: 'var(--text-secondary)', padding: '16px', textAlign: 'center' }}>
            {showIgnored ? 'No ignored issues.' : 'All issues resolved or ignored.'}
          </p>
        </div>
      ) : (
        <div className="action-queue-list">
          {displayedFailures.map((failure, idx) => {
            const key = getIssueKey(failure);
            const isIgnored = ignoredIssues.has(key);
            
            return (
              <div key={`${failure.item}-${idx}`} className={`action-queue-item ${isIgnored ? 'ignored' : ''}`}>
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
                  {isIgnored ? (
                    <button 
                      className="action-button action-secondary"
                      onClick={() => handleRestore(failure)}
                    >
                      Restore
                    </button>
                  ) : (
                    <>
                      <div className="fix-button-wrapper">
                        <button 
                          className="action-button action-primary"
                          onClick={() => handleFixClick(failure)}
                        >
                          Fix
                        </button>
                        {fixTooltip === key && (
                          <span className="coming-soon-tooltip">Coming Soon</span>
                        )}
                      </div>
                      <button 
                        className="action-button action-secondary"
                        onClick={() => handleIgnore(failure)}
                      >
                        Ignore
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
