import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Sparkles, RefreshCw, Layers } from 'lucide-react';
import GlassCard from '../GlassCard';
import MetricCard from '../MetricCard';
import PortfolioChart from '../PortfolioChart';
import { getDashboardData, getTrueHoldings } from '../../lib/ipc';

export default function Dashboard() {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['dashboardData', 1],
        queryFn: () => getDashboardData(1),
        staleTime: 30000,
        refetchOnWindowFocus: false,
    });

    const { data: trueHoldingsData } = useQuery({
        queryKey: ['trueHoldings'],
        queryFn: getTrueHoldings,
        staleTime: 60000,
        refetchOnWindowFocus: false,
    });

    const topTrueExposure = trueHoldingsData?.holdings?.slice(0, 5) || [];

    // Use real data or fallback
    const dashboardData = data;
    const isProfit = dashboardData ? dashboardData.totalGain >= 0 : true;
    const isEmpty = !dashboardData || dashboardData.isEmpty || dashboardData.positionCount === 0;

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
    if (isEmpty || !dashboardData) {
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

    const sparklineData = dashboardData.history.map(h => h.value);

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
                {/* Total Value */}
                <MetricCard 
                    icon={<Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />}
                    label="Total Portfolio Value"
                    value={`€${dashboardData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    color="var(--text-primary)"
                    sparklineData={sparklineData}
                />

                {/* Day Change - NEW */}
                <MetricCard 
                    icon={(dashboardData.dayChange || 0) >= 0 ? <TrendingUp size={20} style={{ color: 'var(--accent-emerald)' }} /> : <TrendingDown size={20} style={{ color: 'var(--accent-red)' }} />}
                    label="Day Change"
                    value={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}€${(dashboardData.dayChange || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    subtitle={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}${(dashboardData.dayChangePercent || 0).toFixed(2)}%`}
                    trend={(dashboardData.dayChange || 0) >= 0 ? 'up' : 'down'}
                    sparklineData={sparklineData.slice(-7)}
                />

                {/* Total P/L */}
                <MetricCard 
                    icon={isProfit ? <TrendingUp size={20} style={{ color: 'var(--accent-emerald)' }} /> : <TrendingDown size={20} style={{ color: 'var(--accent-red)' }} />}
                    label="Total P/L"
                    value={`${isProfit ? '+' : ''}€${dashboardData.totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    subtitle={`${isProfit ? '+' : ''}${dashboardData.gainPercentage.toFixed(1)}%`}
                    trend={isProfit ? 'up' : 'down'}
                />
            </div>

            {/* Performance Chart - NEW */}
            <div style={{ marginBottom: '32px' }}>
                <PortfolioChart data={dashboardData.history} />
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

            {/* True Exposure - Shows combined direct + indirect exposure */}
            {topTrueExposure.length > 0 && (
                <GlassCard style={{ padding: '24px', marginTop: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Layers size={20} style={{ color: 'var(--accent-purple)' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>
                            True Exposure
                        </h3>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
                        Your actual exposure including ETF holdings
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {topTrueExposure.map((holding, index) => {
                            const hasMultipleSources = holding.sources.length > 1;
                            const hasDirect = holding.sources.some(s => s.etf === 'DIRECT');
                            
                            return (
                                <div
                                    key={holding.isin || holding.stock}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        background: 'rgba(139, 92, 246, 0.05)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(139, 92, 246, 0.1)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '6px',
                                                background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '14px',
                                                fontWeight: '700',
                                            }}
                                        >
                                            {index + 1}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '600' }}>{holding.stock}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                {hasDirect && hasMultipleSources 
                                                    ? `Direct + ${holding.sources.length - 1} ETF${holding.sources.length > 2 ? 's' : ''}`
                                                    : hasDirect 
                                                        ? 'Direct only'
                                                        : `${holding.sources.length} ETF${holding.sources.length > 1 ? 's' : ''}`
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                            €{holding.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GlassCard>
            )}
        </div>
    );
}
