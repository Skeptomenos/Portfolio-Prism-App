import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import GlassCard from '../GlassCard';
import MetricCard from '../MetricCard';

// Mock data - will be replaced with real data from Tauri backend
const mockData = {
    totalValue: 124592,
    totalPnL: 12459,
    pnlPercentage: 12.4,
    topHoldings: [
        { name: 'Apple Inc.', ticker: 'AAPL', value: 8420, pnl: 842, pnlPct: 11.1 },
        { name: 'Microsoft Corp.', ticker: 'MSFT', value: 7150, pnl: 650, pnlPct: 10.0 },
        { name: 'NVIDIA Corp.', ticker: 'NVDA', value: 6890, pnl: 1240, pnlPct: 21.9 },
        { name: 'Amazon.com Inc.', ticker: 'AMZN', value: 5320, pnl: 420, pnlPct: 8.6 },
        { name: 'Meta Platforms', ticker: 'META', value: 4280, pnl: -120, pnlPct: -2.7 },
    ],
};

export default function Dashboard() {
    const isProfit = mockData.totalPnL > 0;

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
                        €{mockData.totalValue.toLocaleString()}
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
                            €{Math.abs(mockData.totalPnL).toLocaleString()}
                        </div>
                        <div
                            style={{
                                fontSize: '18px',
                                fontWeight: '600',
                                color: isProfit ? 'var(--accent-emerald)' : 'var(--accent-red)',
                            }}
                        >
                            {isProfit ? '+' : '-'}
                            {mockData.pnlPercentage}%
                        </div>
                    </div>
                </GlassCard>

                <GlassCard style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Diversification</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div>
                            <div className="metric-value" style={{ fontSize: '36px' }}>142</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Unique Stocks</div>
                        </div>
                        <div style={{ width: '1px', height: '40px', background: 'var(--glass-border)' }} />
                        <div>
                            <div className="metric-value" style={{ fontSize: '36px' }}>8</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>ETFs</div>
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* Top Holdings */}
            <GlassCard style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                    Top 5 Holdings
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {mockData.topHoldings.map((holding, index) => (
                        <div
                            key={holding.ticker}
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
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{holding.ticker}</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div className="metric-value" style={{ fontSize: '16px' }}>
                                    €{holding.value.toLocaleString()}
                                </div>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: holding.pnl > 0 ? 'var(--accent-emerald)' : 'var(--accent-red)',
                                    }}
                                >
                                    {holding.pnl > 0 ? '+' : ''}€{holding.pnl} ({holding.pnl > 0 ? '+' : ''}{holding.pnlPct}%)
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
}
