import { useId } from 'react';
import { ShieldCheck, CheckCircle, AlertCircle, MinusCircle, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ResolutionStatus, ResolutionSource } from '../../types';
import './ResolutionStatusBadge.css';

interface ResolutionStatusBadgeProps {
  status: ResolutionStatus;
  source?: ResolutionSource;
  confidence: number;
  originalTicker?: string;
  resolvedIsin?: string;
  compact?: boolean;
}

type ConfidenceLevel = 'verified' | 'high' | 'medium' | 'unresolved' | 'skipped';

function getConfidenceLevel(
  confidence: number,
  source?: string,
  status?: string
): ConfidenceLevel {
  if (status === 'skipped') return 'skipped';
  if (status === 'unresolved' || confidence < 0.50) return 'unresolved';
  if (source === 'provider' || source === 'manual' || confidence === 1.0) return 'verified';
  if (confidence >= 0.80) return 'high';
  return 'medium';
}

const levelConfig: Record<ConfidenceLevel, {
  icon: LucideIcon;
  color: string;
  bgColor: string;
  label: string;
}> = {
  verified: {
    icon: ShieldCheck,
    color: 'var(--accent-emerald, #10b981)',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    label: 'Verified',
  },
  high: {
    icon: CheckCircle,
    color: 'var(--accent-blue, #3b82f6)',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    label: 'High',
  },
  medium: {
    icon: Circle,
    color: 'var(--accent-amber, #f59e0b)',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Medium',
  },
  unresolved: {
    icon: AlertCircle,
    color: 'var(--accent-red, #ef4444)',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    label: 'Unresolved',
  },
  skipped: {
    icon: MinusCircle,
    color: 'var(--text-tertiary, #64748b)',
    bgColor: 'rgba(100, 116, 139, 0.15)',
    label: 'Skipped',
  },
};

const sourceLabels: Record<string, string> = {
  provider: 'Trade Republic',
  manual: 'Manual',
  hive: 'Community Hive',
  local_cache: 'Local Cache',
  api_wikidata: 'Wikidata',
  api_finnhub: 'Finnhub',
  api_yfinance: 'Yahoo Finance',
  api_openfigi: 'OpenFIGI',
  unknown: 'Unknown',
};

export default function ResolutionStatusBadge({
  status,
  source,
  confidence,
  originalTicker,
  resolvedIsin,
  compact = false,
}: ResolutionStatusBadgeProps) {
  const tooltipId = useId();
  const level = getConfidenceLevel(confidence, source, status);
  const config = levelConfig[level];
  const Icon = config.icon;

  const confidencePercent = Math.round(confidence * 100);
  const sourceLabel = sourceLabels[source || 'unknown'] || source || 'Unknown';

  return (
    <div
      className="resolution-badge-wrapper"
      role="button"
      tabIndex={0}
      aria-label={`Resolution status: ${config.label}`}
      aria-describedby={tooltipId}
    >
      <div
        className={`resolution-badge ${compact ? 'compact' : ''}`}
        style={{
          backgroundColor: config.bgColor,
          color: config.color,
        }}
      >
        <Icon size={compact ? 14 : 12} aria-hidden="true" />
        {!compact && <span>{config.label}</span>}
      </div>

      <div id={tooltipId} className="resolution-tooltip" role="tooltip">
        <div className="tooltip-header">
          <Icon size={16} style={{ color: config.color }} aria-hidden="true" />
          <span style={{ color: config.color, fontWeight: 600 }}>{config.label}</span>
        </div>

        <div className="tooltip-divider" />

        <div className="tooltip-row">
          <span className="tooltip-label">Source</span>
          <span className="tooltip-value">{sourceLabel}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Confidence</span>
          <span className="tooltip-value">{confidencePercent}%</span>
        </div>

        {originalTicker && (
          <>
            <div className="tooltip-divider" />
            <div className="tooltip-row">
              <span className="tooltip-label">Original</span>
              <span className="tooltip-value mono">{originalTicker}</span>
            </div>
          </>
        )}

        {resolvedIsin && (
          <div className="tooltip-row">
            <span className="tooltip-label">ISIN</span>
            <span className="tooltip-value mono">{resolvedIsin}</span>
          </div>
        )}
      </div>
    </div>
  );
}
