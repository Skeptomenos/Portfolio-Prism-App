import { useState } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import GlassCard from '../GlassCard';

// Mock holdings data
const mockHoldings = [
    {
        stock: 'Apple Inc.',
        ticker: 'AAPL',
        totalValue: 8420,
        sources: [
            { etf: 'VUSA', weight: 0.045, value: 3200 },
            { etf: 'EQQQ', weight: 0.12, value: 2800 },
            { etf: 'VWRL', weight: 0.034, value: 2100 },
            { etf: 'Direct', weight: 1.0, value: 320 },
        ],
    },
    {
        stock: 'Microsoft Corp.',
        ticker: 'MSFT',
        totalValue: 7150,
        sources: [
            { etf: 'VUSA', weight: 0.038, value: 2850 },
            { etf: 'EQQQ', weight: 0.095, value: 2400 },
            { etf: 'IUIT', weight: 0.15, value: 1900 },
        ],
    },
    {
        stock: 'NVIDIA Corp.',
        ticker: 'NVDA',
        totalValue: 6890,
        sources: [
            { etf: 'EQQQ', weight: 0.18, value: 4200 },
            { etf: 'IUIT', weight: 0.22, value: 2690 },
        ],
    },
];

export default function HoldingsView() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<typeof mockHoldings[0] | null>(null);

    const filteredHoldings = mockHoldings.filter(
        (h) =>
            h.stock.toLowerCase().includes(searchQuery.toLowerCase()) ||
            h.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                    True Holdings Explorer
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    See exactly how you own each stock across your portfolio
                </p>
            </div>

            {/* Search Bar */}
            <GlassCard style={{ padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Search size={20} style={{ color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search for a stock (e.g., 'Apple' or 'AAPL')"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '15px',
                            fontFamily: 'inherit',
                        }}
                    />
                </div>
            </GlassCard>

            {/* Holdings List */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {filteredHoldings.map((holding) => (
                        <GlassCard
                            key={holding.ticker}
                            onClick={() => setSelectedStock(holding)}
                            style={{
                                padding: '20px',
                                cursor: 'pointer',
                                border:
                                    selectedStock?.ticker === holding.ticker
                                        ? '1px solid rgba(59, 130, 246, 0.5)'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: '600' }}>{holding.stock}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        {holding.ticker}
                                    </div>
                                </div>
                                <div className="metric-value" style={{ fontSize: '18px', color: 'var(--accent-blue)' }}>
                                    €{holding.totalValue.toLocaleString()}
                                </div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                Across {holding.sources.length} source{holding.sources.length > 1 ? 's' : ''}
                            </div>
                        </GlassCard>
                    ))}
                </div>

                {/* Decomposition Panel */}
                {selectedStock ? (
                    <GlassCard style={{ padding: '24px', height: 'fit-content', position: 'sticky', top: '0' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{selectedStock.stock}</h3>
                            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                {selectedStock.ticker}
                            </div>
                        </div>

                        <div
                            className="metric-value"
                            style={{
                                fontSize: '32px',
                                color: 'var(--accent-emerald)',
                                marginBottom: '24px',
                            }}
                        >
                            €{selectedStock.totalValue.toLocaleString()}
                        </div>

                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-secondary)' }}>
                            Breakdown by Source
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {selectedStock.sources.map((source) => (
                                <div
                                    key={source.etf}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '12px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600' }}>{source.etf}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                            {(source.weight * 100).toFixed(2)}% weight
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: '600',
                                            fontFamily: 'var(--font-mono)',
                                            color: 'var(--accent-cyan)',
                                        }}
                                    >
                                        €{source.value.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Visual Flow */}
                        <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                                <TrendingUp size={16} style={{ display: 'inline', marginRight: '6px' }} />
                                Exposure Flow
                            </div>
                            {selectedStock.sources.map((source) => (
                                <div key={source.etf} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            color: 'var(--accent-blue)',
                                            fontWeight: '600',
                                            width: '80px',
                                        }}
                                    >
                                        {source.etf}
                                    </span>
                                    <div
                                        style={{
                                            flex: 1,
                                            height: '4px',
                                            background: `linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-cyan) 100%)`,
                                            borderRadius: '2px',
                                            margin: '0 12px',
                                            width: `${(source.value / selectedStock.totalValue) * 100}%`,
                                        }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        {((source.value / selectedStock.totalValue) * 100).toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                ) : (
                    <GlassCard
                        style={{
                            padding: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '300px',
                        }}
                    >
                        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            <Search size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                            <p style={{ fontSize: '14px' }}>Select a stock to see its decomposition</p>
                        </div>
                    </GlassCard>
                )}
            </div>
        </div>
    );
}
