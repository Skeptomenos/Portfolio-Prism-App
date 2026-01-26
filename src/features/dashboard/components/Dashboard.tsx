import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Sparkles, RefreshCw } from 'lucide-react'
import GlassCard from '../../../components/GlassCard'
import MetricCard from './MetricCard'
import PortfolioChart from '../../../components/PortfolioChart'
import { DashboardSkeleton } from '../../../components/ui/Skeleton'
import TopHoldingsCard from './TopHoldingsCard'
import TrueExposureCard from './TrueExposureCard'
import { getDashboardData, getTrueHoldings } from '../../../lib/ipc'

export default function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboardData', 1],
    queryFn: () => getDashboardData(1),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  })

  const { data: trueHoldingsData } = useQuery({
    queryKey: ['trueHoldings'],
    queryFn: getTrueHoldings,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const topTrueExposure = trueHoldingsData?.holdings?.slice(0, 5) || []

  // Use real data or fallback
  const dashboardData = data
  const isProfit = dashboardData ? dashboardData.totalGain >= 0 : true
  const isEmpty = !dashboardData || dashboardData.isEmpty || dashboardData.positionCount === 0

  // Loading state - uses shared DashboardSkeleton component
  if (isLoading) {
    return <DashboardSkeleton />
  }

  // Error state
  if (isError) {
    return (
      <div className="animate-fade-in">
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
            Portfolio Overview
          </h2>
        </div>
        <GlassCard style={{ padding: '32px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Failed to load dashboard data
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
    )
  }

  // Empty state - no positions synced yet
  if (isEmpty || !dashboardData) {
    return (
      <div className="animate-fade-in">
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
            Portfolio Overview
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Your complete exposure across all ETFs and direct holdings
          </p>
        </div>
        <GlassCard style={{ padding: '48px', textAlign: 'center' }}>
          <Sparkles size={48} style={{ color: 'var(--accent-purple)', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
            No Portfolio Data Yet
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Connect to Trade Republic and sync your portfolio to see your holdings here.
          </p>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
            Go to <strong>Trade Republic</strong> in the sidebar to get started.
          </p>
        </GlassCard>
      </div>
    )
  }

  // Null safety: backend could return undefined for history array
  const sparklineData = dashboardData.history?.map((h) => h.value) ?? []

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
          Portfolio Overview
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Your complete exposure across all ETFs and direct holdings
        </p>
      </div>

      {/* Hero Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {/* Total Value */}
        <MetricCard
          icon={<Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />}
          label="Total Portfolio Value"
          value={`€${dashboardData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color="var(--text-primary)"
          sparklineData={sparklineData}
        />

        {/* Day Change - NEW */}
        <MetricCard
          icon={
            (dashboardData.dayChange || 0) >= 0 ? (
              <TrendingUp size={20} style={{ color: 'var(--accent-emerald)' }} />
            ) : (
              <TrendingDown size={20} style={{ color: 'var(--accent-red)' }} />
            )
          }
          label="Day Change"
          value={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}€${(dashboardData.dayChange || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${(dashboardData.dayChange || 0) >= 0 ? '+' : ''}${(dashboardData.dayChangePercent || 0).toFixed(2)}%`}
          trend={(dashboardData.dayChange || 0) >= 0 ? 'up' : 'down'}
          sparklineData={sparklineData.slice(-7)}
        />

        {/* Total P/L */}
        <MetricCard
          icon={
            isProfit ? (
              <TrendingUp size={20} style={{ color: 'var(--accent-emerald)' }} />
            ) : (
              <TrendingDown size={20} style={{ color: 'var(--accent-red)' }} />
            )
          }
          label="Total P/L"
          value={`${isProfit ? '+' : ''}€${dashboardData.totalGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${isProfit ? '+' : ''}${dashboardData.gainPercentage.toFixed(1)}%`}
          trend={isProfit ? 'up' : 'down'}
        />
      </div>

      {/* Performance Chart - NEW */}
      <div style={{ marginBottom: '32px' }}>
        <PortfolioChart data={dashboardData.history} />
      </div>

      {/* Top Holdings */}
      <GlassCard style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Top Holdings</h3>
        {dashboardData.topHoldings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {dashboardData.topHoldings.slice(0, 5).map((holding, index) => (
              <TopHoldingsCard
                key={holding.isin}
                rank={index + 1}
                name={holding.name}
                ticker={holding.ticker}
                isin={holding.isin}
                value={holding.value}
                pnl={holding.pnl}
                pnlPercentage={holding.pnlPercentage}
              />
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '24px' }}>
            No holdings data available
          </p>
        )}
      </GlassCard>

      {/* True Exposure - Shows combined direct + indirect exposure */}
      <TrueExposureCard holdings={topTrueExposure} />
    </div>
  )
}
