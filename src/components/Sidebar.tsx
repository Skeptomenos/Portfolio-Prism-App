import { LayoutDashboard, Layers, GitCompare, Database, Settings, Activity, Link } from 'lucide-react';
import { useAppStore, useCurrentView, useAuthState } from '../store/useAppStore';
import SystemStatus from './SystemStatus';
import type { ViewType } from '../types';

const navItems = [
    { id: 'dashboard' as ViewType, icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'trade-republic' as ViewType, icon: Link, label: 'Trade Republic' },
    { id: 'xray' as ViewType, icon: Layers, label: 'X-Ray' },
    { id: 'overlap' as ViewType, icon: GitCompare, label: 'Overlap' },
    { id: 'holdings' as ViewType, icon: Database, label: 'Holdings' },
    { id: 'data' as ViewType, icon: Settings, label: 'Data' },
    { id: 'health' as ViewType, icon: Activity, label: 'Health' },
];

export default function Sidebar() {
    const currentView = useCurrentView();
    const setCurrentView = useAppStore((state) => state.setCurrentView);
    const authState = useAuthState();

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
                            {item.id === 'trade-republic' && authState === 'authenticated' && (
                                <span
                                    style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: '#10b981',
                                        marginLeft: 'auto',
                                    }}
                                />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Status Footer */}
            <SystemStatus />
        </div>
    );
}
