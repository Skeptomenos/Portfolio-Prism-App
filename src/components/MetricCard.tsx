import { ReactNode } from 'react';
import GlassCard from './GlassCard';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
    icon: ReactNode;
    label: string;
    value: string | number;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
    sparklineData?: number[];
    color?: string; // Optional accent color override
}

export default function MetricCard({ 
    icon, 
    label, 
    value, 
    subtitle, 
    trend, 
    sparklineData,
    color 
}: MetricCardProps) {
    const getTrendColor = () => {
        if (color) return color;
        if (trend === 'up') return 'var(--accent-emerald)';
        if (trend === 'down') return 'var(--accent-red)';
        return 'var(--text-primary)';
    };

    const threadColor = getTrendColor();

    // Prepare data for recharts
    const chartData = sparklineData?.map((val, i) => ({ i, val })) || [];

    return (
        <GlassCard style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', position: 'relative', zIndex: 1 }}>
                {icon}
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            
            <div className="metric-value" style={{ fontSize: '28px', color: threadColor, position: 'relative', zIndex: 1 }}>
                {value}
            </div>
            
            {subtitle && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px', position: 'relative', zIndex: 1 }}>
                    {subtitle}
                </div>
            )}

            {/* Sparkline Background */}
            {sparklineData && sparklineData.length > 1 && (
                <div style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    right: 0, 
                    width: '100%', 
                    height: '60px', 
                    opacity: 0.15,
                    pointerEvents: 'none'
                }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <Line 
                                type="monotone" 
                                dataKey="val" 
                                stroke={threadColor} 
                                strokeWidth={2} 
                                dot={false} 
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </GlassCard>
    );
}
