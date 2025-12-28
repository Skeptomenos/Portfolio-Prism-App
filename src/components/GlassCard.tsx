import { CSSProperties, ReactNode } from 'react';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    onClick?: () => void;
}

export default function GlassCard({ children, className, style, onClick }: GlassCardProps) {
    return (
        <div
            className={`glass-card ${className || ''}`}
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
