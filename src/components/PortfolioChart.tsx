import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import GlassCard from './GlassCard';

interface PortfolioChartProps {
    data: { date: string; value: number }[];
    color?: string;
}

export default function PortfolioChart({ data, color = "#8b5cf6" }: PortfolioChartProps) {
    if (!data || data.length === 0) return null;

    return (
        <GlassCard style={{ padding: '24px', height: '400px', width: '100%' }}>
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Performance History
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    Last 30 Days
                </p>
            </div>

            <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                        dataKey="date" 
                        stroke="var(--text-tertiary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(str) => str.slice(5)} // Show MM-DD
                    />
                    <YAxis 
                        stroke="var(--text-tertiary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(num) => `€${(num / 1000).toFixed(0)}k`}
                        domain={['auto', 'auto']}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'rgba(23, 23, 23, 0.9)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                        }}
                        formatter={(value: number) => [`€${value.toLocaleString(undefined, {minimumFractionDigits: 2})}`, 'Portfolio Value']}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={color} 
                        fillOpacity={1} 
                        fill="url(#colorValue)" 
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </GlassCard>
    );
}
