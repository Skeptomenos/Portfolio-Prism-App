import { Activity, CheckCircle, AlertCircle, MinusCircle, HelpCircle } from 'lucide-react';
import GlassCard from '../../GlassCard';
import type { ResolutionSummary } from '../../../types';
import './ResolutionHealthCard.css';

interface ResolutionHealthCardProps {
  summary: ResolutionSummary;
}

const sourceColors: Record<string, string> = {
  provider: 'var(--accent-emerald, #10b981)',
  manual: 'var(--accent-emerald, #10b981)',
  hive: 'var(--accent-amber, #f59e0b)',
  local_cache: 'var(--accent-purple, #8b5cf6)',
  api_wikidata: 'var(--accent-blue, #3b82f6)',
  api_finnhub: 'var(--accent-blue, #3b82f6)',
  api_yfinance: 'var(--accent-cyan, #06b6d4)',
  api_openfigi: 'var(--accent-cyan, #06b6d4)',
  unknown: 'var(--text-tertiary, #64748b)',
};

const sourceLabels: Record<string, string> = {
  provider: 'Provider',
  manual: 'Manual',
  hive: 'Hive',
  local_cache: 'Cache',
  api_wikidata: 'Wikidata',
  api_finnhub: 'Finnhub',
  api_yfinance: 'yFinance',
  api_openfigi: 'OpenFIGI',
  unknown: 'Unknown',
};

export default function ResolutionHealthCard({ summary }: ResolutionHealthCardProps) {
  const healthPercent = Math.round(summary.healthScore * 100);

  const sortedSources = Object.entries(summary.bySource)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  const maxSourceCount = Math.max(...Object.values(summary.bySource), 1);

  return (
    <GlassCard className="resolution-health-card">
      <div className="health-header">
        <Activity size={20} className="health-icon" />
        <h3>Resolution Health</h3>
      </div>

      <div className="health-stats">
        <div className="stat-card primary">
          <div className="stat-value">{healthPercent}%</div>
          <div className="stat-label">Health Score</div>
          <div className="stat-bar" role="progressbar" aria-valuenow={healthPercent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="stat-bar-fill"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{summary.total.toLocaleString()}</div>
          <div className="stat-label">Total</div>
        </div>

        <div className="stat-card success">
          <CheckCircle size={16} aria-hidden="true" />
          <div className="stat-value">{summary.resolved.toLocaleString()}</div>
          <div className="stat-label">Resolved</div>
        </div>

        <div className="stat-card error">
          <AlertCircle size={16} aria-hidden="true" />
          <div className="stat-value">{summary.unresolved}</div>
          <div className="stat-label">Unresolved</div>
        </div>

        <div className="stat-card muted">
          <MinusCircle size={16} aria-hidden="true" />
          <div className="stat-value">{summary.skipped}</div>
          <div className="stat-label">Skipped</div>
        </div>

        {summary.unknown > 0 && (
          <div className="stat-card muted">
            <HelpCircle size={16} aria-hidden="true" />
            <div className="stat-value">{summary.unknown}</div>
            <div className="stat-label">Unknown</div>
          </div>
        )}
      </div>

      {sortedSources.length > 0 && (
        <div className="source-breakdown">
          <h4>Source Breakdown</h4>
          <div className="source-bars">
            {sortedSources.map(([source, count]) => (
              <div key={source} className="source-row">
                <div className="source-label">
                  {sourceLabels[source] || source}
                </div>
                <div className="source-bar-wrapper">
                  <div
                    className="source-bar"
                    style={{
                      width: `${(count / maxSourceCount) * 100}%`,
                      backgroundColor: sourceColors[source] || 'var(--text-tertiary, #64748b)',
                    }}
                  />
                </div>
                <div className="source-count">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
