import { LayoutDashboard, Layers, Database, Activity, Link, MessageSquare } from 'lucide-react';
import { useAppStore, useCurrentView, useAuthState } from '../store/useAppStore';
import SystemStatus from './SystemStatus';
import type { ViewType } from '../types';

const navItems = [
    { id: 'dashboard' as ViewType, icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'trade-republic' as ViewType, icon: Link, label: 'Trade Republic' },
    { id: 'xray' as ViewType, icon: Layers, label: 'X-Ray' },

    { id: 'holdings' as ViewType, icon: Database, label: 'Holdings' },

    { id: 'health' as ViewType, icon: Activity, label: 'Health' },
];

export default function Sidebar() {
    const currentView = useCurrentView();
    const setCurrentView = useAppStore((state) => state.setCurrentView);
    const authState = useAuthState();
    const openFeedback = useAppStore((state) => state.openFeedback);

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

            {/* Feedback Button */}
            <button
                onClick={openFeedback}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    marginBottom: '16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '14px',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                }}
            >
                <MessageSquare size={16} />
                <span>Send Feedback</span>
            </button>

            {/* Status Footer */}
            <SystemStatus />
        </div>
    );
}
