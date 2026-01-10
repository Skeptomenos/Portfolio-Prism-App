import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test/utils'
import GlassCard from './GlassCard'

describe('GlassCard', () => {
  it('renders children correctly', () => {
    render(<GlassCard>Test Content</GlassCard>)
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('applies glass-card class by default', () => {
    render(<GlassCard>Content</GlassCard>)
    const card = screen.getByText('Content').closest('.glass-card')
    expect(card).toBeInTheDocument()
  })

  it('applies additional className when provided', () => {
    render(<GlassCard className="custom-class">Content</GlassCard>)
    const card = screen.getByText('Content').closest('.glass-card')
    expect(card).toHaveClass('custom-class')
  })

  it('applies custom styles when provided', () => {
    render(<GlassCard style={{ padding: '20px' }}>Content</GlassCard>)
    const card = screen.getByText('Content').closest('.glass-card')
    expect(card).toHaveStyle({ padding: '20px' })
  })

  it('handles click events when onClick is provided', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByText('Clickable').closest('.glass-card')
    fireEvent.click(card!)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('sets role="button" when onClick is provided', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('does not set role="button" when onClick is not provided', () => {
    render(<GlassCard>Not Clickable</GlassCard>)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sets tabIndex=0 when onClick is provided for keyboard accessibility', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('tabIndex', '0')
  })

  it('handles Enter key press when onClick is provided', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('handles Space key press when onClick is provided', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: ' ' })

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not trigger onClick on other key presses', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Tab' })

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('sets cursor to pointer when onClick is provided', () => {
    const handleClick = vi.fn()
    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>)

    const card = screen.getByRole('button')
    expect(card).toHaveStyle({ cursor: 'pointer' })
  })

  it('sets cursor to default when onClick is not provided', () => {
    render(<GlassCard>Not Clickable</GlassCard>)

    const card = screen.getByText('Not Clickable').closest('.glass-card')
    expect(card).toHaveStyle({ cursor: 'default' })
  })
})
