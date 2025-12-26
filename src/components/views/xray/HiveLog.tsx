/**
 * HiveLog Component
 * 
 * Displays community data interactions: Hive hits and new contributions.
 */

import GlassCard from '../../GlassCard';
import type { PipelineHealthReport } from '../../../hooks/usePipelineDiagnostics';
import './HiveLog.css';

// =============================================================================
// Types
// =============================================================================

interface HiveLogProps {
  report: PipelineHealthReport | null;
}

// =============================================================================
// Component
// =============================================================================

export default function HiveLog({ report }: HiveLogProps) {
  // Extract hive data from the report (uses the new fields from backend upgrade)
  const performance = report?.performance;
  const hiveHitRate = performance?.hive_hit_rate ?? 0;
  const totalAssets = performance?.total_assets_processed ?? 0;
  
  // These fields come from the backend upgrade
  const enrichment = report?.enrichment;
  const hiveLog = enrichment?.hive_log;
  const contributions = hiveLog?.contributions || [];
  const hits = hiveLog?.hits || [];

  // Calculate stats
  const hiveHits = hits.length || Math.round((hiveHitRate / 100) * totalAssets);
  const apiCalls = totalAssets - hiveHits;
  const newContributions = contributions.length || enrichment?.stats?.new_contributions || 0;

  return (
    <div className="hive-log-container">
      {/* Summary Stats */}
      <div className="hive-stats-grid">
        <GlassCard style={{ padding: '16px' }}>
          <div className="hive-stat">
            <span className="stat-icon">🐝</span>
            <div className="stat-content">
              <div className="stat-value">{hiveHits}</div>
              <div className="stat-label">From Hive</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ padding: '16px' }}>
          <div className="hive-stat">
            <span className="stat-icon">🔌</span>
            <div className="stat-content">
              <div className="stat-value">{apiCalls}</div>
              <div className="stat-label">API Calls</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ padding: '16px' }}>
          <div className="hive-stat">
            <span className="stat-icon">🎁</span>
            <div className="stat-content">
              <div className="stat-value">{newContributions}</div>
              <div className="stat-label">Contributed</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ padding: '16px' }}>
          <div className="hive-stat">
            <span className="stat-icon">📊</span>
            <div className="stat-content">
              <div className="stat-value">{hiveHitRate.toFixed(0)}%</div>
              <div className="stat-label">Hit Rate</div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Contribution List */}
      {contributions.length > 0 && (
        <div className="hive-section">
          <h4 className="section-title">🎁 Your Contributions</h4>
          <div className="hive-item-list">
            {contributions.slice(0, 10).map((isin, idx) => (
              <div key={isin} className="hive-item contribution">
                <span className="item-index">{idx + 1}</span>
                <span className="item-isin">{isin}</span>
                <span className="item-badge">Shared</span>
              </div>
            ))}
            {contributions.length > 10 && (
              <div className="hive-item more">
                +{contributions.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hit List */}
      {hits.length > 0 && (
        <div className="hive-section">
          <h4 className="section-title">🐝 Community Data Used</h4>
          <div className="hive-item-list">
            {hits.slice(0, 10).map((isin, idx) => (
              <div key={isin} className="hive-item hit">
                <span className="item-index">{idx + 1}</span>
                <span className="item-isin">{isin}</span>
                <span className="item-badge hit">From Hive</span>
              </div>
            ))}
            {hits.length > 10 && (
              <div className="hive-item more">
                +{hits.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {contributions.length === 0 && hits.length === 0 && (
        <GlassCard style={{ padding: '24px', textAlign: 'center', marginTop: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Detailed Hive interaction log will be available after the backend upgrade.
          </p>
        </GlassCard>
      )}
    </div>
  );
}
