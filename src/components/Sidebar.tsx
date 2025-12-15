import { LayoutDashboard, Layers, GitCompare, Database, Settings, Activity } from 'lucide-react';
import { useAppStore, useCurrentView, useEngineStatus } from '../store/useAppStore';
import type { ViewType } from '../types';

const navItems = [
    { id: 'dashboard' as ViewType, icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'xray' as ViewType, icon: Layers, label: 'X-Ray' },
    { id: 'overlap' as ViewType, icon: GitCompare, label: 'Overlap' },
    { id: 'holdings' as ViewType, icon: Database, label: 'Holdings' },
    { id: 'data' as ViewType, icon: Settings, label: 'Data' },
    { id: 'health' as ViewType, icon: Activity, label: 'Health' },
];

/**
 * Get status display info based on engine status
 */
function getStatusDisplay(status: string) {
    switch (status) {
        case 'idle':
            return { color: '#10b981', label: 'Synced', glow: 'rgba(16, 185, 129, 0.5)' };
        case 'processing':
            return { color: '#f59e0b', label: 'Syncing...', glow: 'rgba(245, 158, 11, 0.5)' };
        case 'error':
            return { color: '#ef4444', label: 'Error', glow: 'rgba(239, 68, 68, 0.5)' };
        case 'connecting':
            return { color: '#3b82f6', label: 'Connecting...', glow: 'rgba(59, 130, 246, 0.5)' };
        default:
            return { color: '#6b7280', label: 'Disconnected', glow: 'rgba(107, 114, 128, 0.5)' };
    }
}

export default function Sidebar() {
    const currentView = useCurrentView();
    const engineStatus = useEngineStatus();
    const setCurrentView = useAppStore((state) => state.setCurrentView);
    const lastSyncTime = useAppStore((state) => state.lastSyncTime);
    
    const statusDisplay = getStatusDisplay(engineStatus);
    
    // Format last sync time
    const formatLastSync = () => {
        if (!lastSyncTime) return 'Never';
        const now = new Date();
        const diff = now.getTime() - lastSyncTime.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return lastSyncTime.toLocaleDateString();
    };

    return (
        <div
            style={{
                width: '240px',
                height: '100vh',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px 16px',
            }}
        >
            {/* Logo */}
            <div style={{ marginBottom: '48px', paddingLeft: '12px' }}>
                <h1
                    style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.02em',
                    }}
                >
                    Portfolio Prism
                </h1>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    True Exposure Analysis
                </p>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1 }}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => setCurrentView(item.id)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px',
                                marginBottom: '8px',
                                background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                border: 'none',
                                borderRadius: '8px',
                                color: isActive ? '#3b82f6' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '14px',
                                fontWeight: isActive ? '600' : '400',
                                fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* Status Footer */}
            <div
                style={{
                    padding: '12px',
                    background: `${statusDisplay.color}15`,
                    border: `1px solid ${statusDisplay.color}30`,
                    borderRadius: '8px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: statusDisplay.color,
                            boxShadow: `0 0 8px ${statusDisplay.glow}`,
                        }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {statusDisplay.label}
                    </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    Last updated: {formatLastSync()}
                </p>
            </div>
        </div>
    );
}
