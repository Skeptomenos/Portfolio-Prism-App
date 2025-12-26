/**
 * PipelineStepper Component
 * 
 * Displays a visual timeline of pipeline execution phases.
 * Shows counts and status for each step. Clicking a step can filter the view.
 */

import { CSSProperties } from 'react';
import type { PipelineHealthReport } from '../../../hooks/usePipelineDiagnostics';
import './PipelineStepper.css';

// =============================================================================
// Types
// =============================================================================

export interface PipelineStep {
  key: string;
  label: string;
  icon: string;
  status: 'pending' | 'success' | 'warning' | 'error';
  detail: string;
}

interface PipelineStepperProps {
  report: PipelineHealthReport | null;
  activeStep?: string | null;
  onStepClick?: (stepKey: string) => void;
  style?: CSSProperties;
}

// =============================================================================
// Helpers
// =============================================================================

function buildStepsFromReport(report: PipelineHealthReport | null): PipelineStep[] {
  if (!report) {
    return [
      { key: 'load', label: 'Load', icon: '◇', status: 'pending', detail: 'Waiting...' },
      { key: 'decompose', label: 'Decompose', icon: '◈', status: 'pending', detail: 'Waiting...' },
      { key: 'enrich', label: 'Enrich', icon: '◆', status: 'pending', detail: 'Waiting...' },
      { key: 'aggregate', label: 'Aggregate', icon: '▣', status: 'pending', detail: 'Waiting...' },
    ];
  }

  const { metrics, failures } = report;

  // Step 1: Load
  const totalLoaded = metrics.direct_holdings + metrics.etf_positions;
  const loadStep: PipelineStep = {
    key: 'load',
    label: 'Load',
    icon: '◇',
    status: totalLoaded > 0 ? 'success' : 'warning',
    detail: `${totalLoaded} positions`,
  };

  // Step 2: Decompose
  const etfsProcessed = metrics.etfs_processed;
  const etfsFailed = failures.filter(f => f.stage === 'etf_decomposition').length;
  const decomposeStep: PipelineStep = {
    key: 'decompose',
    label: 'Decompose',
    icon: '◈',
    status: etfsFailed > 0 ? 'warning' : (etfsProcessed > 0 ? 'success' : 'pending'),
    detail: etfsFailed > 0 ? `${etfsProcessed} OK, ${etfsFailed} Failed` : `${etfsProcessed} ETFs`,
  };

  // Step 3: Enrich
  const totalAssets = report.performance?.total_assets_processed || 0;
  const enrichStep: PipelineStep = {
    key: 'enrich',
    label: 'Enrich',
    icon: '◆',
    status: totalAssets > 0 ? 'success' : 'pending',
    detail: `${totalAssets} assets`,
  };

  // Step 4: Aggregate
  const aggregateStep: PipelineStep = {
    key: 'aggregate',
    label: 'Aggregate',
    icon: '▣',
    status: 'success',
    detail: report.performance?.execution_time_seconds 
      ? `${report.performance.execution_time_seconds.toFixed(1)}s` 
      : 'Complete',
  };

  return [loadStep, decomposeStep, enrichStep, aggregateStep];
}

// =============================================================================
// Component
// =============================================================================

export default function PipelineStepper({ report, activeStep, onStepClick, style }: PipelineStepperProps) {
  const steps = buildStepsFromReport(report);

  return (
    <div className="pipeline-stepper-container" style={style}>
      {steps.map((step, index) => (
        <div 
          key={step.key} 
          className={`stepper-step ${step.status} ${activeStep === step.key ? 'active' : ''}`}
          onClick={() => onStepClick?.(step.key)}
          role="button"
          tabIndex={0}
        >
          <div className="stepper-node">
            {step.status === 'success' ? (
              <svg className="stepper-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : step.status === 'warning' ? (
              <span className="stepper-icon warning">!</span>
            ) : step.status === 'error' ? (
              <span className="stepper-icon error">✕</span>
            ) : (
              <span className="stepper-icon">{step.icon}</span>
            )}
          </div>
          <div className="stepper-label">{step.label}</div>
          <div className="stepper-detail">{step.detail}</div>
          {index < steps.length - 1 && (
            <div className={`stepper-connector ${step.status === 'success' ? 'complete' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}
