import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import GlassCard from '../GlassCard';

// Mock sector allocation data
const sectorData = [
    { name: 'Technology', value: 35, color: '#3b82f6' },
    { name: 'Healthcare', value: 18, color: '#10b981' },
    { name: 'Financials', value: 15, color: '#8b5cf6' },
    { name: 'Consumer', value: 12, color: '#06b6d4' },
    { name: 'Industrials', value: 10, color: '#f59e0b' },
    { name: 'Energy', value: 6, color: '#ef4444' },
    { name: 'Other', value: 4, color: '#64748b' },
];

const geographyData = [
    { name: 'United States', value: 62, color: '#3b82f6' },
    { name: 'Europe', value: 20, color: '#10b981' },
    { name: 'Asia Pacific', value: 12, color: '#8b5cf6' },
    { name: 'Emerging Markets', value: 6, color: '#06b6d4' },
];

export default function XRayView() {
    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                    Portfolio X-Ray
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Deep dive into your true asset allocation
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Sector Allocation */}
                <GlassCard style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Sector Allocation
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={sectorData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {sectorData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15, 20, 32, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#f8fafc',
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {sectorData.map((sector) => (
                            <div key={sector.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                    style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '3px',
                                        background: sector.color,
                                    }}
                                />
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {sector.name}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: 'auto' }}>
                                    {sector.value}%
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                {/* Geography Allocation */}
                <GlassCard style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Geographic Allocation
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={geographyData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {geographyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15, 20, 32, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#f8fafc',
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {geographyData.map((region) => (
                            <div key={region.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                    style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '3px',
                                        background: region.color,
                                    }}
                                />
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {region.name}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: 'auto' }}>
                                    {region.value}%
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                {/* Concentration Risk */}
                <GlassCard style={{ padding: '24px', gridColumn: '1 / -1' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Concentration Risk
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Top 10 Holdings
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-cyan)' }}>
                                28.4%
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Largest Single Stock
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-purple)' }}>
                                6.8%
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                AAPL
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                HHI Index
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-emerald)' }}>
                                142
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Well diversified
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Stocks &gt; 5%
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-blue)' }}>
                                2
                            </div>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
