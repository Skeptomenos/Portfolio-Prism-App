import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCcw, Clock, Upload, Shield, Eye, Send, Trash2, ExternalLink } from 'lucide-react';
import { getPipelineReport, runPipeline, getRecentReports, getPendingReviews, setHiveContribution, getHiveContribution } from '../../lib/ipc';
import type { SystemLogReport } from '../../types';
import { useAppStore, useTelemetryMode, useSetTelemetryMode, useHiveContributionEnabled, useSetHiveContributionEnabled } from '../../store/useAppStore';
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
    const [error, setError] = useState<string | null>(null); 
    const [recentReports, setRecentReports] = useState<SystemLogReport[]>([]);
    const [pendingReviews, setPendingReviews] = useState<any[]>([]);
    const [uploadModal, setUploadModal] = useState<{ isOpen: boolean; isin: string; ticker: string }>({
        isOpen: false,
        isin: '',
        ticker: ''
    });
    const setLastPipelineRun = useAppStore(state => state.setLastPipelineRun);
    const telemetryMode = useTelemetryMode();
    const setTelemetryMode = useSetTelemetryMode();
    const hiveContributionEnabled = useHiveContributionEnabled();
    const setHiveContributionEnabled = useSetHiveContributionEnabled();

    const loadHealth = async () => {
        try {
            setLoading(true);
            const [content, reports, pending] = await Promise.all([
                getPipelineReport(),
                getRecentReports(),
                getPendingReviews()
            ]);
            setHealth(content);
            setRecentReports(reports);
            setPendingReviews(pending);
            setError(null);
        } catch (err) {
            console.error('Failed to load health report:', err);
            setHealth(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHealth();
        getHiveContribution().then(setHiveContributionEnabled);
    }, []);

    const handleRunAnalysis = async () => {
        try {
            setLoading(true);
            const result = await runPipeline();
            setLastPipelineRun(Date.now());
            await loadHealth();
            if (!result.success) {
                setError("Pipeline failed to run completely.");
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
        <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '64px' }}>
            {/* Header */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '32px'
            }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>System Health</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Status of the analytics engine, data processing, and telemetry.
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
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
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
                                Help improve Portfolio Prism by reporting anonymized errors.
                            </p>
                        </div>
                    </div>
                    
                    <div style={{ 
                        display: 'flex', 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        padding: '4px', 
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        {(['auto', 'review', 'off'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setTelemetryMode(mode)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: telemetryMode === mode ? '#3b82f6' : 'transparent',
                                    color: telemetryMode === mode ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {pendingReviews.length > 0 && telemetryMode === 'review' && (
                    <div style={{ 
                        marginTop: '24px', 
                        padding: '16px', 
                        background: 'rgba(245, 158, 11, 0.05)', 
                        border: '1px solid rgba(245, 158, 11, 0.2)', 
                        borderRadius: '12px' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={16} />
                                {pendingReviews.length} Reports Waiting for Review
                            </h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '12px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    Send All
                                </button>
                                <button style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    Dismiss All
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {pendingReviews.slice(0, 3).map((log, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '13px' }}>
                                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        [{log.category}] {log.message}
                                    </span>
                                    <div style={{ display: 'flex', gap: '12px', flexShrink: 0, marginLeft: '12px' }}>
                                        <Eye size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} />
                                        <Send size={14} style={{ cursor: 'pointer', color: '#3b82f6' }} />
                                        <Trash2 size={14} style={{ cursor: 'pointer', color: '#ef4444' }} />
                                    </div>
                                </div>
                            ))}
                            {pendingReviews.length > 3 && (
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    + {pendingReviews.length - 3} more
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {recentReports.length > 0 && (
                    <div style={{ marginTop: '24px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Recent Reports (Last 7 Days)
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {recentReports.slice(0, 4).map((report, i) => (
                                <div key={i} style={{ 
                                    padding: '12px', 
                                    background: 'rgba(255, 255, 255, 0.02)', 
                                    border: '1px solid rgba(255, 255, 255, 0.05)', 
                                    borderRadius: '10px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                            {(report.category ?? 'unknown').replace('_', ' ').toUpperCase()}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                            {report.reported_at ? new Date(report.reported_at).toLocaleDateString() : 'N/A'} • {report.component ?? 'unknown'}
                                        </div>
                                    </div>
                                    <ExternalLink size={14} style={{ color: '#3b82f6', cursor: 'pointer' }} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Hive Community Contribution */}
            <div className="mb-8 p-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${hiveContributionEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-gray-400'}`}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                <path d="M2 17l10 5 10-5"/>
                                <path d="M2 12l10 5 10-5"/>
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold mb-1">Hive Community Contribution</h2>
                            <p className="text-gray-400 text-sm max-w-md">
                                Share anonymized ETF holdings and ticker mappings to help other users. No personal data is ever shared.
                            </p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => {
                            const newValue = !hiveContributionEnabled;
                            setHiveContributionEnabled(newValue);
                            setHiveContribution(newValue);
                        }}
                        className={`relative w-[52px] h-7 rounded-full border-none cursor-pointer transition-colors duration-200 ${hiveContributionEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                    >
                        <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-[left] duration-200 ${hiveContributionEnabled ? 'left-[26px]' : 'left-0.5'}`} />
                    </button>
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
                    label="Telemetry" 
                    value={telemetryMode.toUpperCase()} 
                    icon={Shield}
                    color={telemetryMode === 'off' ? "red" : telemetryMode === 'review' ? "orange" : "blue"}
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
