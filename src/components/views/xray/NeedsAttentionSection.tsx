import { useState, useId } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from '../../GlassCard';
import ResolutionStatusBadge from '../../common/ResolutionStatusBadge';
import type { XRayHolding } from '../../../types';
import './NeedsAttentionSection.css';

interface NeedsAttentionSectionProps {
  holdings: XRayHolding[];
  onHoldingClick?: (holding: XRayHolding) => void;
}

export default function NeedsAttentionSection({
  holdings,
  onHoldingClick,
}: NeedsAttentionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const listId = useId();

  if (holdings.length === 0) return null;

  const displayHoldings = isExpanded ? holdings : holdings.slice(0, 5);

  const handleToggle = () => setIsExpanded(!isExpanded);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <GlassCard className="needs-attention-section">
      <div
        className="attention-header"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={listId}
      >
        <div className="attention-title">
          <AlertTriangle size={18} className="attention-icon" aria-hidden="true" />
          <span>{holdings.length} Holdings Need Attention</span>
        </div>
        <span className="expand-btn" aria-hidden="true">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </div>

      <p className="attention-description">
        These holdings could not be fully resolved and may affect analysis accuracy.
      </p>

      <div id={listId} className="attention-list" role="list">
        {displayHoldings.map((holding, index) => (
          <div
            key={holding.isin || `${holding.stock}-${index}`}
            className="attention-item"
            onClick={() => onHoldingClick?.(holding)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && onHoldingClick) {
                e.preventDefault();
                onHoldingClick(holding);
              }
            }}
            role="listitem"
            tabIndex={onHoldingClick ? 0 : undefined}
          >
            <div className="attention-item-info">
              <div className="attention-item-name">{holding.stock}</div>
              {holding.ticker && (
                <div className="attention-item-ticker">{holding.ticker}</div>
              )}
            </div>
            <div className="attention-item-value">
              €{holding.totalValue.toLocaleString()}
            </div>
            <ResolutionStatusBadge
              status={holding.resolutionStatus}
              source={holding.resolutionSource}
              confidence={holding.resolutionConfidence}
              originalTicker={holding.ticker}
              resolvedIsin={holding.isin || undefined}
              compact
            />
          </div>
        ))}
      </div>

      {holdings.length > 5 && !isExpanded && (
        <button
          className="show-more-btn"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          Show {holdings.length - 5} more
        </button>
      )}
    </GlassCard>
  );
}
