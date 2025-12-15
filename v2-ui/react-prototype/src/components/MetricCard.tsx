import { ReactNode } from 'react';
import GlassCard from './GlassCard';

interface MetricCardProps {
    icon: ReactNode;
    label: string;
    value: string | number;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
}

export default function MetricCard({ icon, label, value, subtitle, trend }: MetricCardProps) {
    const getTrendColor = () => {
        if (trend === 'up') return 'var(--accent-emerald)';
        if (trend === 'down') return 'var(--accent-red)';
        return 'var(--text-primary)';
    };

    return (
        <GlassCard style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {icon}
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <div className="metric-value" style={{ fontSize: '28px', color: getTrendColor() }}>
                {value}
            </div>
            {subtitle && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    {subtitle}
                </div>
            )}
        </GlassCard>
    );
}
