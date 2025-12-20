import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCcw, Clock, Upload, Shield } from 'lucide-react';
import { getPipelineReport, runPipeline } from '../../lib/ipc';
import { useAppStore, useAutoReportErrors, useSetAutoReportErrors } from '../../store/useAppStore';
import HoldingsUpload from '../HoldingsUpload';

interface HealthData {
    timestamp: string;
    metrics: {
        direct_holdings: number;
        etf_positions: number;
        etfs_processed: number;
        tier1_resolved: number;
        tier1_failed: number;
    };
    performance: {
        execution_time_seconds: number;
        hive_hit_rate: number;
        api_fallback_rate: number;
        total_assets_processed: number;
        phase_durations: Record<string, number>;
    };
    etf_stats: {
        ticker: string;
        holdings_count: number;
        weight_sum: number;
        status: string;
    }[];
    failures: {
        severity: string;
        stage: string;
        item: string;
        error: string;
        fix: string;
    }[];
}

const HealthView = () => {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(false);
    // Error state used in UI render
    const [error, setError] = useState<string | null>(null); 
    const [uploadModal, setUploadModal] = useState<{ isOpen: boolean; isin: string; ticker: string }>({
        isOpen: false,
        isin: '',
        ticker: ''
    });
    const setLastPipelineRun = useAppStore(state => state.setLastPipelineRun);
    const autoReportErrors = useAutoReportErrors();
    const setAutoReportErrors = useSetAutoReportErrors();

    const loadHealth = async () => {
        try {
            setLoading(true);
            // Use backend command instead of direct FS
            const content = await getPipelineReport();
            setHealth(content);
            setError(null);
        } catch (err) {
            console.error('Failed to load health report:', err);
            // Don't show error if file just doesn't exist yet (fresh install)
            setHealth(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHealth();
    }, []);

    const handleRunAnalysis = async () => {
        try {
            setLoading(true);
            const result = await runPipeline();
            setLastPipelineRun(Date.now());
            if (result.success) {
                await loadHealth(); // Reload report
            } else {
                setError("Pipeline failed to run completely.");
                await loadHealth(); // Try to load report anyway to see partial errors
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Pipeline execution failed');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return 'Never';
        return new Date(isoString).toLocaleString();
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '32px'
            }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Pipeline Health</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Status of the analytics engine and data processing.
                    </p>
                </div>
                <button
                    onClick={handleRunAnalysis}
                    disabled={loading}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        border: 'none',
                        borderRadius: '12px',
                        color: 'white',
                        fontWeight: '600',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    <RefreshCcw size={18} className={loading ? 'spin' : ''} />
                    {loading ? 'Running...' : 'Run Diagnostics'}
                </button>
            </div>
            {/* Error Banner */}
            {error && (
                <div style={{
                    marginBottom: '32px',
                    padding: '16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '12px',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* Telemetry Settings */}
            <div style={{
                marginBottom: '32px',
                padding: '24px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        padding: '12px',
                        borderRadius: '12px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6'
                    }}>
                        <Shield size={24} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Automatic Error Reporting</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            Help improve Portfolio Prism by automatically reporting anonymized errors.
                        </p>
                    </div>
                </div>
                <div 
                    onClick={() => setAutoReportErrors(!autoReportErrors)}
                    style={{
                        width: '50px',
                        height: '26px',
                        background: autoReportErrors ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '13px',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                >
                    <div style={{
                        width: '20px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '3px',
                        left: autoReportErrors ? '27px' : '3px',
                        transition: 'left 0.2s'
                    }} />
                </div>
            </div>

            {/* Status Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
                <StatusCard 
                    label="Last Run" 
                    value={formatDate(health?.timestamp)} 
                    icon={Clock}
                    color="blue"
                />
                <StatusCard 
                    label="Hive Hit Rate" 
                    value={health?.performance ? `${health.performance.hive_hit_rate}%` : '0%'} 
                    icon={CheckCircle}
                    color="green"
                />
                <StatusCard 
                    label="Auto-Report" 
                    value={autoReportErrors ? 'Active' : 'Review'} 
                    icon={Shield}
                    color={autoReportErrors ? "blue" : "orange"}
                />
                <StatusCard 
                    label="Active Errors" 
                    value={health?.failures.length || 0} 
                    icon={health?.failures.length ? AlertCircle : CheckCircle}
                    color={health?.failures.length ? "red" : "green"}
                />
            </div>

            {/* Error List */}
            {health?.failures && health.failures.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Active Issues</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {health.failures.map((fail, i) => (
                            <div key={i} style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                gap: '16px'
                            }}>
                                <AlertCircle size={24} style={{ color: '#ef4444', flexShrink: 0 }} />
                                <div>
                                    <h3 style={{ fontWeight: '600', marginBottom: '4px', color: '#ef4444' }}>
                                        {fail.stage}: {fail.item}
                                    </h3>
                                    <p style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>{fail.error}</p>
                                    <div style={{ 
                                        display: 'inline-block',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        padding: '4px 12px',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        color: '#ef4444',
                                        fontWeight: '500'
                                    }}>
                                        Fix: {fail.fix}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ETF Breakdown */}
            {health?.etf_stats && (
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>ETF Decomposition Status</h2>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '16px',
                        overflow: 'hidden'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <th style={{ textAlign: 'left', padding: '16px', color: 'var(--text-secondary)', fontWeight: '500' }}>Ticker</th>
                                    <th style={{ textAlign: 'left', padding: '16px', color: 'var(--text-secondary)', fontWeight: '500' }}>Holdings Found</th>
                                    <th style={{ textAlign: 'left', padding: '16px', color: 'var(--text-secondary)', fontWeight: '500' }}>Total Weight</th>
                                    <th style={{ textAlign: 'right', padding: '16px', color: 'var(--text-secondary)', fontWeight: '500' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {health.etf_stats.map((etf, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                        <td style={{ padding: '16px' }}>{etf.ticker}</td>
                                        <td style={{ padding: '16px' }}>{etf.holdings_count}</td>
                                        <td style={{ padding: '16px' }}>{etf.weight_sum.toFixed(1)}%</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                                {etf.status !== 'complete' && (
                                                    <button
                                                        onClick={() => setUploadModal({ isOpen: true, isin: etf.ticker, ticker: etf.ticker })}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '4px 10px',
                                                            background: 'rgba(59, 130, 246, 0.1)',
                                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                                            borderRadius: '8px',
                                                            color: '#3b82f6',
                                                            fontSize: '12px',
                                                            fontWeight: '600',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Upload size={14} />
                                                        Upload
                                                    </button>
                                                )}
                                                <span style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '12px',
                                                    fontWeight: '500',
                                                    background: etf.status === 'complete' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    color: etf.status === 'complete' ? '#10b981' : '#ef4444',
                                                }}>
                                                    {etf.status === 'complete' ? 'Ready' : 'Missing Data'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <HoldingsUpload
                isOpen={uploadModal.isOpen}
                onClose={() => setUploadModal({ ...uploadModal, isOpen: false })}
                etfIsin={uploadModal.isin}
                etfTicker={uploadModal.ticker}
                onSuccess={loadHealth}
            />
        </div>
    );
};

const StatusCard = ({ label, value, icon: Icon, color }: any) => {
    const colors = {
        blue: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
        green: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' },
        orange: { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' },
        red: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' },
    };
    
    const theme = colors[color as keyof typeof colors] || colors.blue;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{label}</span>
                <div style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: theme.bg,
                    color: theme.text
                }}>
                    <Icon size={20} />
                </div>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{value}</span>
        </div>
    );
};

export default HealthView;
