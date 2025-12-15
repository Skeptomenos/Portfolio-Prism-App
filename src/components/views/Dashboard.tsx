import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Sparkles, RefreshCw } from 'lucide-react';
import GlassCard from '../GlassCard';
import { getDashboardData } from '../../lib/ipc';
import type { DashboardData } from '../../types';

// Fallback mock data - used when no real data is available
const FALLBACK_DATA: DashboardData = {
    totalValue: 0,
    totalGain: 0,
    gainPercentage: 0,
    allocations: {
        sector: {},
        region: {},
    },
    topHoldings: [],
    lastUpdated: null,
    isEmpty: true,
    positionCount: 0,
};

export default function Dashboard() {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['dashboardData', 1],
        queryFn: () => getDashboardData(1),
        staleTime: 30000, // 30 seconds
        refetchOnWindowFocus: false,
    });

    // Use real data or fallback
    const dashboardData = data || FALLBACK_DATA;
    const isProfit = dashboardData.totalGain >= 0;
    const isEmpty = dashboardData.isEmpty || dashboardData.positionCount === 0;

    // Loading state
    if (isLoading) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Overview
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Loading your portfolio data...
                    </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                    {[1, 2, 3].map((i) => (
                        <GlassCard key={i} style={{ padding: '24px', minHeight: '120px' }}>
                            <div style={{ 
                                background: 'rgba(255,255,255,0.05)', 
                                borderRadius: '8px', 
                                height: '20px', 
                                width: '60%',
                                marginBottom: '12px',
                                animation: 'pulse 1.5s infinite'
                            }} />
                            <div style={{ 
                                background: 'rgba(255,255,255,0.08)', 
                                borderRadius: '8px', 
                                height: '36px', 
                                width: '80%',
                                animation: 'pulse 1.5s infinite'
                            }} />
                        </GlassCard>
                    ))}
                </div>
            </div>
        );
    }

    // Error state
    if (isError) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Overview
                    </h2>
                </div>
                <GlassCard style={{ padding: '32px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Failed to load dashboard data
                    </p>
                    <button
                        onClick={() => refetch()}
                        style={{
                            padding: '12px 24px',
                            background: 'var(--accent-blue)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <RefreshCw size={16} />
                        Retry
                    </button>
                </GlassCard>
            </div>
        );
    }

    // Empty state - no positions synced yet
    if (isEmpty) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Overview
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Your complete exposure across all ETFs and direct holdings
                    </p>
                </div>
                <GlassCard style={{ padding: '48px', textAlign: 'center' }}>
                    <Sparkles size={48} style={{ color: 'var(--accent-purple)', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                        No Portfolio Data Yet
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                        Connect to Trade Republic and sync your portfolio to see your holdings here.
                    </p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                        Go to <strong>Trade Republic</strong> in the sidebar to get started.
                    </p>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                    Portfolio Overview
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Your complete exposure across all ETFs and direct holdings
                </p>
            </div>

            {/* Hero Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                <GlassCard style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Total Portfolio Value</span>
                    </div>
                    <div className="metric-value" style={{ fontSize: '36px', color: 'var(--text-primary)' }}>
                        €{dashboardData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </GlassCard>

                <GlassCard style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        {isProfit ? (
                            <TrendingUp size={20} style={{ color: 'var(--accent-emerald)' }} />
                        ) : (
                            <TrendingDown size={20} style={{ color: 'var(--accent-red)' }} />
                        )}
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Total P/L</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <div
                            className="metric-value"
                            style={{
                                fontSize: '36px',
                                color: isProfit ? 'var(--accent-emerald)' : 'var(--accent-red)',
                            }}
                        >
                            {isProfit ? '+' : ''}€{dashboardData.totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div
                            style={{
                                fontSize: '18px',
                                fontWeight: '600',
                                color: isProfit ? 'var(--accent-emerald)' : 'var(--accent-red)',
                            }}
                        >
                            {isProfit ? '+' : ''}
                            {dashboardData.gainPercentage.toFixed(1)}%
                        </div>
                    </div>
                </GlassCard>

                <GlassCard style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Positions</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div>
                            <div className="metric-value" style={{ fontSize: '36px' }}>{dashboardData.positionCount || dashboardData.topHoldings.length}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Total Holdings</div>
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* Top Holdings */}
            <GlassCard style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                    Top Holdings
                </h3>
                {dashboardData.topHoldings.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {dashboardData.topHoldings.slice(0, 5).map((holding, index) => (
                            <div
                                key={holding.isin}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '16px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '8px',
                                            background: `linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '18px',
                                            fontWeight: '700',
                                        }}
                                    >
                                        {index + 1}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '15px', fontWeight: '600' }}>{holding.name}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                            {holding.ticker || holding.isin}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div className="metric-value" style={{ fontSize: '16px' }}>
                                        €{holding.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: holding.pnl >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)',
                                        }}
                                    >
                                        {holding.pnl >= 0 ? '+' : ''}€{holding.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({holding.pnl >= 0 ? '+' : ''}{holding.pnlPercentage.toFixed(1)}%)
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '24px' }}>
                        No holdings data available
                    </p>
                )}
            </GlassCard>
        </div>
    );
}
