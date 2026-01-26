import { useState, useRef, useCallback } from 'react'
import Modal from '../../../components/ui/Modal'
import { uploadHoldings, runPipeline } from '../../../lib/ipc'
import { logger } from '../../../lib/logger'
import type { PipelineFailure } from '../types'

const SUPPORTED_FILE_TYPES = '.csv,.xlsx,.xls,.json'
const MAX_FILE_SIZE_MB = 10

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
  dropZone: {
    border: '2px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '20px',
  },
  dropZoneActive: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    background: 'rgba(59, 130, 246, 0.05)',
  },
  dropZoneHasFile: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    background: 'rgba(16, 185, 129, 0.05)',
  },
  dropIcon: {
    fontSize: '36px',
    marginBottom: '12px',
    opacity: 0.6,
  },
  dropText: {
    color: '#94a3b8',
    fontSize: '14px',
    marginBottom: '4px',
  },
  dropSubtext: {
    color: '#64748b',
    fontSize: '12px',
  },
  fileName: {
    color: '#10b981',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '4px',
  },
  fileSize: {
    color: '#64748b',
    fontSize: '12px',
  },
  statusBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  statusSuccess: {
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  statusError: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
  },
  statusTitle: {
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '2px',
  },
  statusMessage: {
    fontSize: '12px',
    opacity: 0.8,
    lineHeight: 1.4,
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
  primaryButton: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#fff',
  },
  primaryButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    cursor: 'not-allowed',
  },
  successButton: {
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#fff',
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

interface UploadResult {
  holdings_count: number
  total_weight: number
  contributed_to_hive: boolean
}

// ISIN format: 2 letters + 9 alphanumeric + 1 check digit (12 chars total)
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ActionModal({
  isOpen,
  onClose,
  failure,
  actionType,
  onSuccess,
}: ActionModalProps): JSX.Element | null {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setFile(null)
    setIsUploading(false)
    setUploadStatus('idle')
    setErrorMessage(null)
    setUploadResult(null)
    setIsDragOver(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const handleFileChange = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return

    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`)
      return
    }

    const ext = selectedFile.name.split('.').pop()?.toLowerCase()
    if (!ext || !['csv', 'xlsx', 'xls', 'json'].includes(ext)) {
      setErrorMessage('Invalid file type. Please use CSV, XLSX, or JSON.')
      return
    }

    setFile(selectedFile)
    setUploadStatus('idle')
    setErrorMessage(null)
  }, [])

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      handleFileChange(droppedFile)
    },
    [handleFileChange]
  )

  const handleUpload = useCallback(async () => {
    if (!file || !failure) return

    const isin = extractIsin(failure.item)
    if (!isin) {
      setErrorMessage('Could not identify ISIN from the failure item.')
      return
    }

    setIsUploading(true)
    setErrorMessage(null)

    try {
      // Tauri File objects have a 'path' property; browser falls back to file.name
      const filePath = (file as unknown as { path?: string }).path || file.name

      const result = await uploadHoldings(filePath, isin)

      setUploadResult({
        holdings_count: result.holdingsCount,
        total_weight: result.totalWeight,
        contributed_to_hive: result.contributedToHive,
      })
      setUploadStatus('success')

      try {
        await runPipeline()
      } catch (pipelineError) {
        logger.warn('Pipeline re-run after upload failed', {
          error: pipelineError instanceof Error ? pipelineError.message : 'Unknown',
        })
      }

      onSuccess?.()
    } catch (err) {
      setUploadStatus('error')
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setErrorMessage(message)
      logger.error('Holdings upload failed', err instanceof Error ? err : undefined)
    } finally {
      setIsUploading(false)
    }
  }, [file, failure, onSuccess])

  if (!failure) return null

  const isin = extractIsin(failure.item)
  const canUpload = isEtfResolutionFailure(failure) && isin
  const modalTitle =
    actionType === 'fix' && canUpload
      ? `Fix: Upload Holdings for ${isin}`
      : actionType === 'fix'
        ? 'Fix Issue'
        : 'Issue Details'

  if (actionType === 'view' || (actionType === 'fix' && !canUpload)) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle}>
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
              This issue cannot be automatically fixed through the UI. The suggested action above
              may require manual intervention or configuration changes.
            </p>
          )}

          <div style={styles.buttonContainer}>
            <button style={{ ...styles.button, ...styles.cancelButton }} onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} closeOnOverlayClick={false}>
      <div style={styles.container}>
        <p style={styles.description}>
          Upload a CSV, XLSX, or JSON file containing the holdings for <strong>{isin}</strong>. The
          system will automatically parse, clean, and normalize the data.
        </p>

        <div style={styles.failureInfo}>
          <div style={styles.failureLabel}>Current Issue</div>
          <div style={{ ...styles.failureValue, fontSize: '13px', color: '#fca5a5' }}>
            {failure.error}
          </div>
        </div>

        <div
          style={{
            ...styles.dropZone,
            ...(isDragOver ? styles.dropZoneActive : {}),
            ...(file ? styles.dropZoneHasFile : {}),
          }}
          onClick={handleDropZoneClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            accept={SUPPORTED_FILE_TYPES}
            style={{ display: 'none' }}
          />

          {file ? (
            <>
              <div style={styles.dropIcon}>📄</div>
              <div style={styles.fileName}>{file.name}</div>
              <div style={styles.fileSize}>{formatFileSize(file.size)}</div>
            </>
          ) : (
            <>
              <div style={styles.dropIcon}>📁</div>
              <div style={styles.dropText}>Click to select or drag and drop</div>
              <div style={styles.dropSubtext}>
                CSV, XLSX, XLS, or JSON • Max {MAX_FILE_SIZE_MB}MB
              </div>
            </>
          )}
        </div>

        {uploadStatus === 'success' && uploadResult && (
          <div style={{ ...styles.statusBox, ...styles.statusSuccess }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            <div>
              <div style={{ ...styles.statusTitle, color: '#10b981' }}>Upload Successful</div>
              <div style={{ ...styles.statusMessage, color: '#34d399' }}>
                Found {uploadResult.holdings_count} holdings with {uploadResult.total_weight}% total
                weight.
                {uploadResult.contributed_to_hive && ' Data contributed to community Hive.'}
              </div>
            </div>
          </div>
        )}

        {(uploadStatus === 'error' || errorMessage) && (
          <div style={{ ...styles.statusBox, ...styles.statusError }}>
            <span style={{ fontSize: '18px' }}>⚠</span>
            <div>
              <div style={{ ...styles.statusTitle, color: '#ef4444' }}>
                {uploadStatus === 'error' ? 'Upload Failed' : 'Validation Error'}
              </div>
              <div style={{ ...styles.statusMessage, color: '#fca5a5' }}>{errorMessage}</div>
            </div>
          </div>
        )}

        <div style={styles.buttonContainer}>
          <button
            style={{ ...styles.button, ...styles.cancelButton }}
            onClick={handleClose}
            disabled={isUploading}
          >
            {uploadStatus === 'success' ? 'Close' : 'Cancel'}
          </button>

          {uploadStatus === 'success' ? (
            <button style={{ ...styles.button, ...styles.successButton }} onClick={handleClose}>
              Done
            </button>
          ) : (
            <button
              style={{
                ...styles.button,
                ...(file && !isUploading ? styles.primaryButton : styles.primaryButtonDisabled),
              }}
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading ? 'Processing...' : 'Upload & Analyze'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
