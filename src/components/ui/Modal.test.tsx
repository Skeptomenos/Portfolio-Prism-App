import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '../../test/utils'
import { Modal } from './Modal'

describe('Modal', () => {
  beforeEach(() => {
    document.body.style.overflow = 'unset'
  })

  afterEach(() => {
    document.body.style.overflow = 'unset'
  })

  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false}>Content</Modal>)
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })

  it('renders children when isOpen is true', () => {
    render(<Modal isOpen={true}>Modal Content</Modal>)
    expect(screen.getByText('Modal Content')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(
      <Modal isOpen={true} title="Test Title">
        Content
      </Modal>
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('renders close button by default', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose}>
        Content
      </Modal>
    )

    const closeButton = screen.getByRole('button')
    expect(closeButton).toBeInTheDocument()
  })

  it('hides close button when showCloseButton is false', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} showCloseButton={false}>
        Content
      </Modal>
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Title">
        Content
      </Modal>
    )

    const closeButton = screen.getByRole('button')
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked and closeOnOverlayClick is true', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} closeOnOverlayClick={true}>
        Content
      </Modal>
    )

    const overlay = container.querySelector('div[style*="position: fixed"]')
    fireEvent.click(overlay!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when overlay is clicked and closeOnOverlayClick is false', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} closeOnOverlayClick={false}>
        Content
      </Modal>
    )

    const overlay = container.querySelector('div[style*="position: fixed"]')
    fireEvent.click(overlay!)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose when modal content is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} closeOnOverlayClick={true}>
        <div data-testid="modal-content">Content</div>
      </Modal>
    )

    fireEvent.click(screen.getByTestId('modal-content'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed and closeOnEscape is true', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} closeOnEscape={true}>
        Content
      </Modal>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when Escape key is pressed and closeOnEscape is false', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} closeOnEscape={false}>
        Content
      </Modal>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('prevents body scroll when modal is open', () => {
    render(<Modal isOpen={true}>Content</Modal>)

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll when modal is closed', () => {
    const { rerender } = render(<Modal isOpen={true}>Content</Modal>)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Modal isOpen={false}>Content</Modal>)
    expect(document.body.style.overflow).toBe('unset')
  })

  it('cleans up event listeners on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <Modal isOpen={true} onClose={onClose} closeOnEscape={true}>
        Content
      </Modal>
    )

    unmount()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
