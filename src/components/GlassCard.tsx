import { CSSProperties, ReactNode, KeyboardEvent } from 'react';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    onClick?: () => void;
}

export default function GlassCard({ children, className, style, onClick }: GlassCardProps) {
    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div
            className={`glass-card ${className || ''}`}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            style={{
                ...style,
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
            {children}
        </div>
    );
}
