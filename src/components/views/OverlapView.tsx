import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import { getOverlapAnalysis } from '../../lib/ipc';

const getOverlapColor = (value: number) => {
    if (value === 100) return 'rgba(59, 130, 246, 0.4)';
    if (value > 80) return 'rgba(239, 68, 68, 0.6)';
    if (value > 60) return 'rgba(245, 158, 11, 0.5)';
    if (value > 40) return 'rgba(16, 185, 129, 0.4)';
    return 'rgba(100, 116, 139, 0.2)';
};

export default function OverlapView() {
    const [data, setData] = useState<{ etfs: string[], matrix: number[][], sharedHoldings: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const res = await getOverlapAnalysis();
            setData(res);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load overlap analysis', err);
            setError(err.message || 'Failed to load overlap data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

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

    if (!data || data.etfs.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '48px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No Overlap Data</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Run the deep analysis in the Health tab to generate your ETF overlap analysis.</p>
            </div>
        );
    }

    const { etfs, matrix, sharedHoldings } = data;

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                    ETF Overlap Analysis
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Identify hidden concentration across your ETF holdings
                </p>
            </div>

            {/* Overlap Matrix */}
            <GlassCard style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                    Overlap Heatmap
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '12px', textAlign: 'left' }} />
                                {etfs.map((etf) => (
                                    <th
                                        key={etf}
                                        style={{
                                            padding: '12px',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {etf}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {etfs.map((rowEtf, rowIndex) => (
                                <tr key={rowEtf}>
                                    <td
                                        style={{
                                            padding: '12px',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {rowEtf}
                                    </td>
                                    {matrix[rowIndex].map((value, colIndex) => (
                                        <td
                                            key={colIndex}
                                            style={{
                                                padding: '16px',
                                                textAlign: 'center',
                                                background: getOverlapColor(value),
                                                borderRadius: '8px',
                                                fontSize: '15px',
                                                fontWeight: '600',
                                                fontFamily: 'var(--font-mono)',
                                            }}
                                        >
                                            {value}%
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '20px', display: 'flex', gap: '20px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', background: 'rgba(239, 68, 68, 0.6)', borderRadius: '4px' }} />
                        <span style={{ color: 'var(--text-tertiary)' }}>High overlap (&gt;80%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', background: 'rgba(245, 158, 11, 0.5)', borderRadius: '4px' }} />
                        <span style={{ color: 'var(--text-tertiary)' }}>Medium overlap (60-80%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '16px', height: '16px', background: 'rgba(16, 185, 129, 0.4)', borderRadius: '4px' }} />
                        <span style={{ color: 'var(--text-tertiary)' }}>Low overlap (&lt;60%)</span>
                    </div>
                </div>
            </GlassCard>

            {/* Shared Holdings */}
            <GlassCard style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                    Most Duplicated Holdings
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {sharedHoldings.map((item) => (
                        <div
                            key={item.stock}
                            style={{
                                padding: '16px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: '600' }}>{item.stock}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                        Found in {item.etfs.length} ETFs
                                    </div>
                                </div>
                                <div className="metric-value" style={{ fontSize: '16px' }}>
                                    €{item.totalValue.toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {item.etfs.map((etf: string) => (
                                    <span
                                        key={etf}
                                        style={{
                                            padding: '4px 12px',
                                            background: 'rgba(59, 130, 246, 0.15)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            color: 'var(--accent-blue)',
                                            fontWeight: '600',
                                        }}
                                    >
                                        {etf}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
}
