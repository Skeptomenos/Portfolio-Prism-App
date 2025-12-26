import { useState } from 'react';
import PipelineProgressCard from '../common/PipelineProgressCard';
import { useDashboardData } from '../../hooks/usePortfolioData';
import { usePipelineDiagnostics } from '../../hooks/usePipelineDiagnostics';
import { useActivePortfolioId } from '../../store/useAppStore';
import { runPipeline } from '../../lib/ipc';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelineProgress } from '../../hooks/usePipelineProgress';

// X-Ray Components
import { PipelineStepper, ResolutionTable, ActionQueue, HiveLog } from './xray';
import type { PipelineFailure } from '../../hooks/usePipelineDiagnostics';

// =============================================================================
// Types
// =============================================================================

type TabKey = 'resolution' | 'actions' | 'hive';

interface TabConfig {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { key: 'resolution', label: 'ETF Resolution', icon: '📁' },
  { key: 'actions', label: 'Action Queue', icon: '🚨' },
  { key: 'hive', label: 'Hive Log', icon: '🐝' },
];

// =============================================================================
// Component
// =============================================================================

export default function XRayView() {
  const activePortfolioId = useActivePortfolioId();
  const { isLoading: isDashboardLoading } = useDashboardData(activePortfolioId);
  const { data: diagnostics, isLoading: isDiagnosticsLoading, refetch: refetchDiagnostics } = usePipelineDiagnostics();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SSE connection for pipeline progress (side effect only - values used elsewhere)
  usePipelineProgress();
  const [activeTab, setActiveTab] = useState<TabKey>('resolution');
  const [activeStep, setActiveStep] = useState<string | null>(null);

  // Manual analysis trigger
  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await runPipeline();

      if (!result.success) {
        const errorMsg = result.errors.length > 0
          ? result.errors.join('. ')
          : "Pipeline failed with unknown error";
        throw new Error(errorMsg);
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['pipelineDiagnostics'] });
      await refetchDiagnostics();
    } catch (err: any) {
      console.error('Failed to run analysis', err);
      const errorMessage = typeof err === 'string' ? err : (err?.message || "Analysis failed to start");
      setError(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle step click from PipelineStepper
  const handleStepClick = (stepKey: string) => {
    setActiveStep(stepKey);
    // Map step to tab
    if (stepKey === 'decompose') setActiveTab('resolution');
    else if (stepKey === 'enrich') setActiveTab('hive');
  };

  // Handle action from ActionQueue
  const handleAction = (action: string, item: PipelineFailure) => {
    console.log('Action triggered:', action, item);
    // TODO: Implement action modals (Upload CSV, Ignore list, etc.)
  };

  const isLoading = isDashboardLoading || isDiagnosticsLoading;
  const hasData = diagnostics && (diagnostics.metrics?.etf_positions > 0 || diagnostics.metrics?.direct_holdings > 0);

  // Loading state
  if (isLoading && !diagnostics) {
    return (
      <div className="animate-pulse" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Loading pipeline data...</p>
      </div>
    );
  }

  // No data state
  if (!hasData && !isAnalyzing) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
        <h3>No Pipeline Data Available</h3>
        <p style={{ marginBottom: '20px' }}>Sync your portfolio and run analysis to see pipeline insights.</p>

        {error && (
          <div style={{
            margin: '0 auto 20px auto',
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            color: '#fca5a5',
            maxWidth: '400px',
            fontSize: '14px'
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          className="btn btn-primary"
          style={{
            padding: '10px 20px',
            background: 'var(--accent-primary)',
            color: 'white',
            minWidth: '180px'
          }}
        >
          Run Deep Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
            Pipeline Operations
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Inspect data flow and resolve issues
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          className="btn btn-primary"
          style={{ minWidth: '160px' }}
        >
          {isAnalyzing ? (
            <>
              <span className="animate-spin" style={{ marginRight: '8px', display: 'inline-block', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', width: '12px', height: '12px' }}></span>
              Analyzing...
            </>
          ) : 'Run Analysis'}
        </button>
      </div>

      {/* Pipeline Progress (when running) */}
      {isAnalyzing && (
        <div style={{ marginBottom: '24px' }}>
          <PipelineProgressCard />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{
          marginBottom: '20px',
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          color: '#fca5a5',
          fontSize: '14px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Pipeline Stepper (Zone 1) */}
      <div style={{ marginBottom: '24px' }}>
        <PipelineStepper
          report={diagnostics || null}
          activeStep={activeStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Tab Navigation */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab.key ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              border: activeTab === tab.key ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              borderRadius: '8px',
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ marginRight: '6px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content (Zone 2) */}
      <div>
        {activeTab === 'resolution' && (
          <ResolutionTable report={diagnostics || null} />
        )}
        {activeTab === 'actions' && (
          <ActionQueue report={diagnostics || null} onAction={handleAction} />
        )}
        {activeTab === 'hive' && (
          <HiveLog report={diagnostics || null} />
        )}
      </div>
    </div>
  );
}
