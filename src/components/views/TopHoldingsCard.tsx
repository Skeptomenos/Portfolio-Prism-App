/**
 * TopHoldingsCard - Displays a single holding in the Top Holdings list
 *
 * Extracted from Dashboard.tsx (Task 9.2) to improve maintainability.
 * Shows holding name, ticker/ISIN, value, and P&L with rank badge.
 */

interface TopHoldingsCardProps {
  /** 1-based rank of the holding (1-5) */
  rank: number
  /** Display name of the holding */
  name: string
  /** Ticker symbol (falls back to ISIN if not available) */
  ticker: string | undefined
  /** ISIN identifier (used as fallback display if no ticker) */
  isin: string
  /** Current value in EUR */
  value: number
  /** Profit/loss amount in EUR */
  pnl: number
  /** Profit/loss percentage */
  pnlPercentage: number
}

export default function TopHoldingsCard({
  rank,
  name,
  ticker,
  isin,
  value,
  pnl,
  pnlPercentage,
}: TopHoldingsCardProps) {
  const isProfitable = pnl >= 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Rank badge */}
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: `linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: '700',
          }}
        >
          {rank}
        </div>
        {/* Name and ticker */}
        <div>
          <div style={{ fontSize: '15px', fontWeight: '600' }}>{name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{ticker || isin}</div>
        </div>
      </div>
      {/* Value and P&L */}
      <div style={{ textAlign: 'right' }}>
        <div className="metric-value" style={{ fontSize: '16px' }}>
          €
          {value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: '600',
            color: isProfitable ? 'var(--accent-emerald)' : 'var(--accent-red)',
          }}
        >
          {isProfitable ? '+' : ''}€
          {pnl.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          ({isProfitable ? '+' : ''}
          {pnlPercentage.toFixed(1)}%)
        </div>
      </div>
    </div>
  )
}
