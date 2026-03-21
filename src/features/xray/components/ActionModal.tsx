import Modal from '../../../components/ui/Modal'
import HoldingsUpload from '../../integrations/components/HoldingsUpload'
import type { PipelineFailure } from '../types'

const styles = {
  container: {
    padding: '8px 0',
  },
  description: {
    color: '#94a3b8',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: 1.6,
  },
  failureInfo: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '20px',
  },
  failureLabel: {
    color: '#64748b',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  failureValue: {
    color: '#e2e8f0',
    fontSize: '14px',
    fontWeight: 500,
  },
  failureFix: {
    color: '#fbbf24',
    fontSize: '13px',
    marginTop: '8px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  buttonContainer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    border: 'none',
  },
  cancelButton: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
  },
}

export type ActionType = 'fix' | 'view' | 'ignore'

interface ActionModalProps {
  isOpen: boolean
  onClose: () => void
  failure: PipelineFailure | null
  actionType: ActionType
  onSuccess?: () => void
}

function extractIsin(item: string): string | null {
  const isinMatch = item.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/g)
  return isinMatch?.[0] ?? null
}

function isEtfResolutionFailure(failure: PipelineFailure): boolean {
  const stage = failure.stage.toLowerCase()
  return (
    stage.includes('decompos') ||
    stage.includes('resolution') ||
    stage.includes('etf') ||
    (failure.error?.toLowerCase().includes('holdings') ?? false)
  )
}

export default function ActionModal({
  isOpen,
  onClose,
  failure,
  actionType,
  onSuccess,
}: ActionModalProps): JSX.Element | null {
  if (!failure) {
    return null
  }

  const isin = extractIsin(failure.item)
  const canUpload = Boolean(isin) && isEtfResolutionFailure(failure)

  if (actionType === 'fix' && canUpload && isin) {
    return (
      <HoldingsUpload
        isOpen={isOpen}
        onClose={onClose}
        etfIsin={isin}
        etfTicker={isin}
        onSuccess={onSuccess}
      />
    )
  }

  const modalTitle = actionType === 'fix' ? 'Fix Issue' : 'Issue Details'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <div style={styles.container}>
        <div style={styles.failureInfo}>
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.failureLabel}>Stage</div>
            <div style={styles.failureValue}>{failure.stage.replace(/_/g, ' ')}</div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={styles.failureLabel}>Item</div>
            <div style={styles.failureValue}>{failure.item}</div>
          </div>
          <div style={{ marginBottom: failure.fix ? '12px' : '0' }}>
            <div style={styles.failureLabel}>Error</div>
            <div style={{ ...styles.failureValue, color: '#fca5a5' }}>{failure.error}</div>
          </div>
          {failure.fix && (
            <div style={styles.failureFix}>
              <span>💡</span>
              <span>{failure.fix}</span>
            </div>
          )}
        </div>

        {actionType === 'fix' && !canUpload && (
          <p style={styles.description}>
            This issue cannot be fixed automatically through the UI. Review the failure details and
            apply the recommended manual action.
          </p>
        )}

        <div style={styles.buttonContainer}>
          <button style={{ ...styles.button, ...styles.cancelButton }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
