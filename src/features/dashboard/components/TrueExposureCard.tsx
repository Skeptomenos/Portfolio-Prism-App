import { Layers } from 'lucide-react'
import GlassCard from '../../../components/GlassCard'
import type { XRayHolding } from '../../../types'

interface TrueExposureCardProps {
  holdings: XRayHolding[]
}

function TrueExposureItem({ holding, rank }: { holding: XRayHolding; rank: number }): JSX.Element {
  const hasMultipleSources = holding.sources.length > 1
  const hasDirect = holding.sources.some((s) => s.etf === 'DIRECT')

  const sourceDescription =
    hasDirect && hasMultipleSources
      ? `Direct + ${holding.sources.length - 1} ETF${holding.sources.length > 2 ? 's' : ''}`
      : hasDirect
        ? 'Direct only'
        : `${holding.sources.length} ETF${holding.sources.length > 1 ? 's' : ''}`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'rgba(139, 92, 246, 0.05)',
        borderRadius: '10px',
        border: '1px solid rgba(139, 92, 246, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: '700',
          }}
        >
          {rank}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>{holding.stock}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{sourceDescription}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
          €
          {holding.totalValue.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </div>
      </div>
    </div>
  )
}

export default function TrueExposureCard({ holdings }: TrueExposureCardProps): JSX.Element | null {
  if (holdings.length === 0) {
    return null
  }

  return (
    <GlassCard style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Layers size={20} style={{ color: 'var(--accent-purple)' }} />
        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>True Exposure</h3>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
        Your actual exposure including ETF holdings
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {holdings.map((holding, index) => (
          <TrueExposureItem
            key={holding.isin || holding.stock}
            holding={holding}
            rank={index + 1}
          />
        ))}
      </div>
    </GlassCard>
  )
}
