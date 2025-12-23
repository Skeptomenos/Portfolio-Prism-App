import { useMemo } from 'react';
import { usePipelineProgress, PipelinePhase } from '../../hooks/usePipelineProgress';
import GlassCard from '../GlassCard';
import './PipelineProgressCard.css';

// =============================================================================
// Types & Constants
// =============================================================================

interface PhaseConfig {
  key: PipelinePhase;
  label: string;
  icon: string;
}

const PIPELINE_PHASES: PhaseConfig[] = [
  { key: 'loading', label: 'Load', icon: '◇' },
  { key: 'decomposition', label: 'Decompose', icon: '◈' },
  { key: 'enrichment', label: 'Enrich', icon: '◆' },
  { key: 'aggregation', label: 'Aggregate', icon: '▣' },
  { key: 'reporting', label: 'Report', icon: '◉' },
];

// =============================================================================
// Component
// =============================================================================

export default function PipelineProgressCard() {
  const { progress, message, phase, isConnected } = usePipelineProgress();

  // Determine which phases are complete, active, or pending
  const phaseStates = useMemo(() => {
    const currentIndex = PIPELINE_PHASES.findIndex(config => config.key === phase);
    
    return PIPELINE_PHASES.map((_, index) => {
      if (phase === 'complete') return 'complete';
      if (phase === 'idle' || phase === 'sync') return 'pending';
      if (index < currentIndex) return 'complete';
      if (index === currentIndex) return 'active';
      return 'pending';
    });
  }, [phase]);

  // Format progress for display
  const displayProgress = Math.round(progress);
  const isComplete = phase === 'complete';

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      <div className="pipeline-progress-card">
        {/* Header */}
        <div className="pipeline-header">
          <div className="pipeline-title">
            <span className="pipeline-icon">⬡</span>
            <span>Pipeline Analysis</span>
          </div>
          <div className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="connection-dot" />
            <span className="connection-label">{isConnected ? 'Live' : 'Connecting...'}</span>
          </div>
        </div>

        {/* Progress Section */}
        <div className="pipeline-progress-section">
          {/* Percentage Display */}
          <div className="progress-percentage">
            <span className="progress-value">{displayProgress}</span>
            <span className="progress-symbol">%</span>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div className="progress-bar-track">
              <div 
                className={`progress-bar-fill ${isComplete ? 'complete' : ''}`}
                style={{ width: `${progress}%` }}
              >
                <div className="progress-bar-shimmer" />
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="progress-message-container">
            <p className="progress-message" key={message}>
              {message || 'Initializing pipeline...'}
            </p>
          </div>
        </div>

        {/* Phase Stepper */}
        <div className="phase-stepper">
          {PIPELINE_PHASES.map((phaseConfig, index) => {
            const state = phaseStates[index];
            return (
              <div 
                key={phaseConfig.key} 
                className={`phase-step ${state}`}
              >
                <div className="phase-node">
                  {state === 'complete' ? (
                    <svg className="phase-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="phase-icon">{phaseConfig.icon}</span>
                  )}
                </div>
                <span className="phase-label">{phaseConfig.label}</span>
                {index < PIPELINE_PHASES.length - 1 && (
                  <div className={`phase-connector ${state === 'complete' ? 'complete' : ''}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Completion State */}
        {isComplete && (
          <div className="pipeline-complete">
            <div className="complete-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="16 10 11 15 8 12" />
              </svg>
              <span>Analysis Complete</span>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
