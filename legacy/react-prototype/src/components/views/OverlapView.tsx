import GlassCard from '../GlassCard';

// Mock overlap data
const etfs = ['VUSA', 'EQQQ', 'VWRL', 'IUIT', 'VFEM'];

const overlapMatrix = [
    [100, 85, 92, 78, 45],
    [85, 100, 88, 95, 38],
    [92, 88, 100, 82, 62],
    [78, 95, 82, 100, 35],
    [45, 38, 62, 35, 100],
];

const sharedStocks = [
    { stock: 'Apple Inc.', etfs: ['VUSA', 'EQQQ', 'VWRL'], totalValue: 8420 },
    { stock: 'Microsoft Corp.', etfs: ['VUSA', 'EQQQ', 'VWRL', 'IUIT'], totalValue: 7150 },
    { stock: 'NVIDIA Corp.', etfs: ['EQQQ', 'IUIT', 'VWRL'], totalValue: 6890 },
];

const getOverlapColor = (value: number) => {
    if (value === 100) return 'rgba(59, 130, 246, 0.4)';
    if (value > 80) return 'rgba(239, 68, 68, 0.6)';
    if (value > 60) return 'rgba(245, 158, 11, 0.5)';
    if (value > 40) return 'rgba(16, 185, 129, 0.4)';
    return 'rgba(100, 116, 139, 0.2)';
};

export default function OverlapView() {
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
                                    {overlapMatrix[rowIndex].map((value, colIndex) => (
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
                    {sharedStocks.map((item) => (
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
                                {item.etfs.map((etf) => (
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
