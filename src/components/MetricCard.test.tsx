import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/utils'
import MetricCard from './MetricCard'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

describe('MetricCard', () => {
  const defaultProps = {
    icon: <span data-testid="test-icon">📊</span>,
    label: 'Test Label',
    value: '1,234',
  }

  it('renders icon correctly', () => {
    render(<MetricCard {...defaultProps} />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('renders label correctly', () => {
    render(<MetricCard {...defaultProps} />)
    expect(screen.getByText('Test Label')).toBeInTheDocument()
  })

  it('renders value correctly', () => {
    render(<MetricCard {...defaultProps} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders numeric value correctly', () => {
    render(<MetricCard {...defaultProps} value={5678} />)
    expect(screen.getByText('5678')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<MetricCard {...defaultProps} subtitle="Some subtitle" />)
    expect(screen.getByText('Some subtitle')).toBeInTheDocument()
  })

  it('does not render subtitle when not provided', () => {
    render(<MetricCard {...defaultProps} />)
    expect(screen.queryByText('Some subtitle')).not.toBeInTheDocument()
  })

  it('renders sparkline when sparklineData is provided with more than 1 point', () => {
    render(<MetricCard {...defaultProps} sparklineData={[10, 20, 30, 40]} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('does not render sparkline when sparklineData has only 1 point', () => {
    render(<MetricCard {...defaultProps} sparklineData={[10]} />)
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
  })

  it('does not render sparkline when sparklineData is not provided', () => {
    render(<MetricCard {...defaultProps} />)
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument()
  })

  it('applies up trend color', () => {
    render(<MetricCard {...defaultProps} trend="up" />)
    const valueElement = screen.getByText('1,234')
    expect(valueElement).toHaveStyle({ color: 'var(--accent-emerald)' })
  })

  it('applies down trend color', () => {
    render(<MetricCard {...defaultProps} trend="down" />)
    const valueElement = screen.getByText('1,234')
    expect(valueElement).toHaveStyle({ color: 'var(--accent-red)' })
  })

  it('applies neutral trend color', () => {
    render(<MetricCard {...defaultProps} trend="neutral" />)
    const valueElement = screen.getByText('1,234')
    expect(valueElement).toHaveStyle({ color: 'var(--text-primary)' })
  })

  it('applies custom color when provided', () => {
    render(<MetricCard {...defaultProps} color="#ff00ff" />)
    const valueElement = screen.getByText('1,234')
    expect(valueElement).toHaveStyle({ color: '#ff00ff' })
  })

  it('custom color overrides trend color', () => {
    render(<MetricCard {...defaultProps} trend="up" color="#ff00ff" />)
    const valueElement = screen.getByText('1,234')
    expect(valueElement).toHaveStyle({ color: '#ff00ff' })
  })

  it('wraps content in GlassCard', () => {
    render(<MetricCard {...defaultProps} />)
    const glassCard = screen.getByText('1,234').closest('.glass-card')
    expect(glassCard).toBeInTheDocument()
  })
})
