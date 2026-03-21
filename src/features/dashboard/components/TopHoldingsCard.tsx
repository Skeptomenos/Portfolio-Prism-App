interface TopHoldingsCardProps {
  rank: number
  name: string
  ticker: string | undefined
  isin: string
  value: number
  pnl: number
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
}: TopHoldingsCardProps): JSX.Element {
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
        <div>
          <div style={{ fontSize: '15px', fontWeight: '600' }}>{name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{ticker || isin}</div>
        </div>
      </div>
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
