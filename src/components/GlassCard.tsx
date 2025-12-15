import { CSSProperties, ReactNode } from 'react';

interface GlassCardProps {
    children: ReactNode;
    style?: CSSProperties;
    onClick?: () => void;
}

export default function GlassCard({ children, style, onClick }: GlassCardProps) {
    return (
        <div
            className="glass-card"
            onClick={onClick}
            style={{
                ...style,
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
            {children}
        </div>
    );
}
