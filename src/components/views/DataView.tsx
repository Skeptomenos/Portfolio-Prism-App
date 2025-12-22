import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Database, AlertCircle } from 'lucide-react';
import GlassCard from '../GlassCard';
import PortfolioTable from '../portfolio/PortfolioTable';
import { getPositions } from '../../lib/ipc';

export default function DataView() {
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['positions', 1],
        queryFn: () => getPositions(1),
        staleTime: 30000,
    });

    if (isLoading) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Data
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Loading your positions...
                    </p>
                </div>
                <GlassCard style={{ padding: '48px', textAlign: 'center' }}>
                    <div className="animate-spin" style={{ 
                        margin: '0 auto 16px auto',
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: 'var(--accent-blue)',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px'
                    }} />
                    <p style={{ color: 'var(--text-secondary)' }}>Fetching data from engine...</p>
                </GlassCard>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Data
                    </h2>
                </div>
                <GlassCard style={{ padding: '32px', textAlign: 'center' }}>
                    <AlertCircle size={48} style={{ color: 'var(--accent-red)', marginBottom: '16px' }} />
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Failed to load portfolio positions
                    </p>
                    <button
                        onClick={() => refetch()}
                        style={{
                            padding: '12px 24px',
                            background: 'var(--accent-blue)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <RefreshCw size={16} />
                        Retry
                    </button>
                </GlassCard>
            </div>
        );
    }

    const positions = data?.positions || [];

    if (positions.length === 0) {
        return (
            <div className="animate-fade-in">
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio Data
                    </h2>
                </div>
                <GlassCard style={{ padding: '48px', textAlign: 'center' }}>
                    <Database size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                        No Data Found
                    </h3>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Sync your portfolio from Trade Republic to see your data here.
                    </p>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                    Portfolio Data
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Raw position data and manual overrides
                </p>
            </div>

            <PortfolioTable positions={positions} />
        </div>
    );
}
