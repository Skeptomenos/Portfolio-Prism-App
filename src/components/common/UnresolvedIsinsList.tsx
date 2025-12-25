import { useState, useMemo } from 'react';
import { UnresolvedItem } from '../../hooks/usePipelineProgress';
import './PipelineSummaryCard.css';

// =============================================================================
// Types
// =============================================================================

interface UnresolvedIsinsListProps {
  items: UnresolvedItem[];
  totalCount: number;
  isTruncated: boolean;
  skippedTier2Count: number;
}

type ReasonType = UnresolvedItem['reason'];

interface ReasonBadgeConfig {
  label: string;
  colorClass: string;
}

const REASON_BADGES: Record<ReasonType, ReasonBadgeConfig> = {
  api_all_failed: { label: 'API Failed', colorClass: 'badge-red' },
  no_ticker: { label: 'No Ticker', colorClass: 'badge-orange' },
  invalid_isin: { label: 'Invalid', colorClass: 'badge-red' },
};

const INITIAL_VISIBLE_COUNT = 5;
const MAX_VISIBLE_COUNT = 100;

// =============================================================================
// Helpers
// =============================================================================

function formatWeight(weight: number): string {
  // Weight is already a percentage from Python (e.g., 0.8 = 0.8%)
  return `${weight.toFixed(1)}%`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// =============================================================================
// Component
// =============================================================================

export default function UnresolvedIsinsList({
  items,
  totalCount,
  isTruncated,
  skippedTier2Count,
}: UnresolvedIsinsListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine visible items
  const visibleItems = useMemo(() => {
    if (isExpanded) {
      return items.slice(0, MAX_VISIBLE_COUNT);
    }
    return items.slice(0, INITIAL_VISIBLE_COUNT);
  }, [items, isExpanded]);

  const hasMoreItems = items.length > INITIAL_VISIBLE_COUNT;
  const additionalNotShown = isTruncated ? totalCount - items.length : 0;

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="unresolved-section">
      {/* Header */}
      <div className="unresolved-header">
        <div className="unresolved-title">
          <span className="warning-icon">⚠</span>
          <span>{totalCount} Failed Resolutions</span>
        </div>
        {skippedTier2Count > 0 && (
          <span className="skipped-note">
            ({skippedTier2Count} low-priority items skipped)
          </span>
        )}
      </div>

      {/* Table */}
      <div className="unresolved-table-container">
        <table className="unresolved-table">
          <thead>
            <tr>
              <th className="col-ticker">Ticker</th>
              <th className="col-name">Name</th>
              <th className="col-weight">Weight</th>
              <th className="col-parent">Parent ETF</th>
              <th className="col-reason">Reason</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, index) => {
              const badgeConfig = REASON_BADGES[item.reason];
              return (
                <tr key={`${item.ticker}-${index}`}>
                  <td className="col-ticker">
                    <span className="ticker-text">{item.ticker || '—'}</span>
                  </td>
                  <td className="col-name" title={item.name}>
                    {truncateText(item.name, 30)}
                  </td>
                  <td className="col-weight">{formatWeight(item.weight)}</td>
                  <td className="col-parent" title={item.parent_etf}>
                    {truncateText(item.parent_etf, 20)}
                  </td>
                  <td className="col-reason">
                    <span className={`reason-badge ${badgeConfig.colorClass}`}>
                      {badgeConfig.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="unresolved-footer">
        {hasMoreItems && (
          <button
            className="expand-button"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Show Less' : `Show All (${items.length})`}
          </button>
        )}
        {additionalNotShown > 0 && (
          <span className="truncated-note">
            {additionalNotShown} additional failures not shown
          </span>
        )}
      </div>
    </div>
  );
}
