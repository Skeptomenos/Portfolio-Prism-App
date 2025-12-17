import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import GlassCard from '../GlassCard';
import { useDashboardData } from '../../hooks/usePortfolioData';
import { useActivePortfolioId } from '../../store/useAppStore';
import { runPipeline } from '../../lib/ipc';
import { useQueryClient } from '@tanstack/react-query';

// Palette for dynamic charts
const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#64748b', // slate-500
];

export default function XRayView() {
    const activePortfolioId = useActivePortfolioId();
    const { data: dashboardData, isLoading } = useDashboardData(activePortfolioId);
    const queryClient = useQueryClient();
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper to transform allocations record to chart data
    const getChartData = (allocations: Record<string, number> | undefined) => {
        if (!allocations || Object.keys(allocations).length === 0) return [];
        
        return Object.entries(allocations)
            .map(([name, value], index) => {
                // Defensive: ensure value is a number
                const numVal = typeof value === 'string' ? parseFloat(value) : value;
                const safeVal = isNaN(numVal) ? 0 : numVal;
                
                return {
                    name,
                    value: Math.round(safeVal * 100), // Convert decimal to pct (0.35 -> 35)
                    color: COLORS[index % COLORS.length]
                };
            })
            .filter(item => item.value > 0) // Filter out 0% segments
            .sort((a, b) => b.value - a.value); // Sort descending
    };

    // Manual analysis trigger
    const handleRunAnalysis = async () => {
        setIsAnalyzing(true);
        setError(null);
        try {
            const result = await runPipeline();
            
            if (!result.success) {
                const errorMsg = result.errors.length > 0 
                    ? result.errors.join('. ') 
                    : "Pipeline failed with unknown error";
                throw new Error(errorMsg);
            }

            // Invalidate query to refresh data
            await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        } catch (err: any) {
            console.error('Failed to run analysis', err);
            // Handle both Error objects and raw string errors from Tauri invoke
            const errorMessage = typeof err === 'string' ? err : (err?.message || "Analysis failed to start");
            setError(errorMessage);
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (isLoading || !dashboardData) {
        return (
            <div className="animate-pulse" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>Fetching latest data...</p>
            </div>
        );
    }

    const sectorData = getChartData(dashboardData.allocations?.sector);
    const geographyData = getChartData(dashboardData.allocations?.region);
    
    // Top holding concentration
    const topHolding = dashboardData.topHoldings?.[0];
    const topHoldingWeight = topHolding ? Math.round(topHolding.weight * 1000) / 10 : 0; // 0.068 -> 6.8
    
    // Calculate concentration of top 10
    const top10Weight = dashboardData.topHoldings?.reduce((sum: number, h: any) => sum + h.weight, 0) || 0;
    const top10Pct = Math.round(top10Weight * 1000) / 10;
    
    const hasData = sectorData.length > 0 || geographyData.length > 0;

    if (!hasData) {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
                <h3>No Analytics Data Available</h3>
                <p style={{ marginBottom: '20px' }}>Sync your portfolio or run analysis manually to generate X-Ray analytics.</p>
                
                {error && (
                    <div style={{ 
                        margin: '0 auto 20px auto', 
                        padding: '12px', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.2)', 
                        borderRadius: '8px',
                        color: '#fca5a5',
                        maxWidth: '400px',
                        fontSize: '14px'
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                <button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="btn btn-primary"
                    style={{
                        padding: '10px 20px',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        minWidth: '180px'
                    }}
                >
                    {isAnalyzing ? (
                       <>
                         <span className="animate-spin" style={{ marginRight: '8px', display: 'inline-block', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', width: '12px', height: '12px' }}></span>
                         Running...
                       </>
                    ) : 'Run Deep Analysis'}
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                        Portfolio X-Ray
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Deep dive into your true asset allocation
                    </p>
                </div>
                <button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="btn btn-primary"
                    style={{
                        minWidth: '160px' // Prevent layout jump during loading text change
                    }}
                >
                    {isAnalyzing ? (
                       <>
                         <span className="animate-spin" style={{ marginRight: '8px', display: 'inline-block', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', width: '12px', height: '12px' }}></span>
                         Running...
                       </>
                    ) : 'Run Deep Analysis'}
                </button>
            </div>

            {error && (
                <div style={{ 
                    marginBottom: '20px', 
                    padding: '12px', 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    borderRadius: '8px',
                    color: '#fca5a5',
                    fontSize: '14px'
                }}>
                    ⚠️ {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Sector Allocation */}
                <GlassCard style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Sector Allocation
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={sectorData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {sectorData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15, 20, 32, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#f8fafc',
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {sectorData.map((sector) => (
                            <div key={sector.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                    style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '3px',
                                        background: sector.color,
                                    }}
                                />
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {sector.name}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: 'auto' }}>
                                    {sector.value}%
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                {/* Geography Allocation */}
                <GlassCard style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Geographic Allocation
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={geographyData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {geographyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15, 20, 32, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#f8fafc',
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {geographyData.map((region) => (
                            <div key={region.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                    style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '3px',
                                        background: region.color,
                                    }}
                                />
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    {region.name}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: '600', marginLeft: 'auto' }}>
                                    {region.value}%
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                {/* Concentration Risk */}
                <GlassCard style={{ padding: '24px', gridColumn: '1 / -1' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                        Concentration Risk
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Top 10 Holdings
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-cyan)' }}>
                                {top10Pct}%
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Largest Single Stock
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-purple)' }}>
                                {topHoldingWeight}%
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {topHolding?.name || 'N/A'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                                Stocks &gt; 5%
                            </div>
                            <div className="metric-value" style={{ fontSize: '24px', color: 'var(--accent-blue)' }}>
                                {dashboardData.topHoldings?.filter(h => h.weight > 0.05).length || 0}
                            </div>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
