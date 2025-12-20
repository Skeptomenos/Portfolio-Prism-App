import { useState, useEffect } from 'react';
import { Search, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import { getTrueHoldings } from '../../lib/ipc';

export default function HoldingsView() {
    const [searchQuery, setSearchQuery] = useState('');
    const [holdings, setHoldings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedStock, setSelectedStock] = useState<any | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const res = await getTrueHoldings();
            setHoldings(res.holdings || []);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load true holdings', err);
            setError(err.message || 'Failed to load holdings data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filteredHoldings = holdings.filter(
        (h) =>
            h.stock.toLowerCase().includes(searchQuery.toLowerCase()) ||
            h.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: '48px' }}>
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Error Loading Data</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
                <button 
                    onClick={loadData}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (holdings.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '48px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No Holdings Data</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Run the deep analysis in the Health tab to generate your true holdings breakdown.</p>
            </div>
        );
    }

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
                            {selectedStock.sources.map((source: any) => (
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
                            {selectedStock.sources.map((source: any) => (
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
