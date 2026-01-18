/**
 * Two-Factor Authentication Modal
 *
 * Centered modal for entering 2FA code from Trade Republic app.
 * Features countdown timer and auto-submit on 4 digits.
 */

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { useAppStore } from '../../store/useAppStore'
import { trSubmit2FA } from '../../lib/ipc'

const styles = {
  container: {
    textAlign: 'center' as const,
  },
  description: {
    color: '#94a3b8',
    fontSize: '14px',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  codeContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  codeInput: {
    width: '48px',
    height: '56px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 600,
    textAlign: 'center' as const,
    outline: 'none',
    transition: 'all 0.2s',
  },
  codeInputFocus: {
    borderColor: '#10b981',
    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
  },
  countdown: {
    color: '#94a3b8',
    fontSize: '13px',
    marginBottom: '20px',
  },
  countdownExpired: {
    color: '#ef4444',
  },
  resendButton: {
    background: 'transparent',
    border: 'none',
    color: '#3b82f6',
    cursor: 'pointer',
    fontSize: '13px',
    textDecoration: 'underline',
    marginTop: '8px',
  },
  resendButtonDisabled: {
    color: '#64748b',
    cursor: 'not-allowed',
    textDecoration: 'none',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    padding: '12px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  buttonContainer: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  button: {
    flex: 1,
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
  },
  cancelButton: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
  },
  verifyButton: {
    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    color: '#fff',
  },
  verifyButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    cursor: 'not-allowed',
  },
}

interface TwoFactorModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /**
   * Callback to request code resend. Parent handles credentials internally.
   * Returns the new countdown value, or throws on failure.
   * SECURITY: Credentials are NOT passed as props to prevent exposure in React DevTools.
   */
  onResendRequest?: () => Promise<number>
  initialCountdown?: number
}

export const TwoFactorModal: React.FC<TwoFactorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onResendRequest,
  initialCountdown = 30,
}) => {
  const [code, setCode] = useState(['', '', '', ''])
  const [countdown, setCountdown] = useState(initialCountdown)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const { setAuthState, addToast } = useAppStore()

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', ''])
      setCountdown(initialCountdown)
      setError(null)
      setIsLoading(false)
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [isOpen, initialCountdown])

  // Countdown timer
  useEffect(() => {
    if (!isOpen || countdown <= 0 || isLoading) return

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isOpen, countdown, isLoading])

  // Auto-submit when all digits entered
  useEffect(() => {
    const fullCode = code.join('')
    if (fullCode.length === 4 && !isLoading) {
      handleVerify()
    }
  }, [code])

  const handleInputChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(0, 1)

    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    setError(null)

    // Auto-focus next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
      const newCode = [...code]
      newCode[index - 1] = ''
      setCode(newCode)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    const newCode = pastedData.split('').concat(['', '', '', '']).slice(0, 4)
    setCode(newCode)

    const nextEmptyIndex = newCode.findIndex((digit) => !digit)
    const focusIndex = nextEmptyIndex >= 0 ? nextEmptyIndex : 3
    inputRefs.current[focusIndex]?.focus()
  }

  const handleVerify = async () => {
    const fullCode = code.join('')
    if (fullCode.length !== 4) {
      setError('Please enter all 4 digits')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await trSubmit2FA(fullCode)

      if (response.authState === 'authenticated') {
        setAuthState('authenticated')
        addToast({
          type: 'success',
          title: 'Authentication successful',
          message: 'Connected to Trade Republic',
        })
        onSuccess()
      } else {
        setError(response.message || 'Verification failed')
        setCode(['', '', '', ''])
        inputRefs.current[0]?.focus()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed'
      setError(message)
      setCode(['', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    // SECURITY: Credentials handled by parent via callback - not exposed in props
    if (countdown > 0 || isLoading || !onResendRequest) return

    setIsLoading(true)
    setError(null)

    try {
      const newCountdown = await onResendRequest()
      setCountdown(newCountdown)
      setCode(['', '', '', ''])
      inputRefs.current[0]?.focus()
      addToast({
        type: 'info',
        title: 'Code resent',
        message: 'Check your Trade Republic app',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resend code'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const canVerify = code.join('').length === 4 && !isLoading
  const canResend = countdown <= 0 && !isLoading && !!onResendRequest

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Verification Code"
      closeOnOverlayClick={false}
      closeOnEscape={!isLoading}
    >
      <div style={styles.container}>
        <p style={styles.description}>Enter the 4-digit code from your Trade Republic app</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.codeContainer}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInputChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={index === 0 ? handlePaste : undefined}
              disabled={isLoading}
              style={{
                ...styles.codeInput,
                ...(document.activeElement === inputRefs.current[index]
                  ? styles.codeInputFocus
                  : {}),
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#10b981'
                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                e.target.style.boxShadow = 'none'
              }}
            />
          ))}
        </div>

        <div
          style={{
            ...styles.countdown,
            ...(countdown <= 0 ? styles.countdownExpired : {}),
          }}
        >
          {countdown > 0 ? `Code expires in ${formatCountdown(countdown)}` : 'Code expired'}
        </div>

        {onResendRequest && (
          <button
            onClick={handleResend}
            disabled={!canResend}
            style={{
              ...styles.resendButton,
              ...(canResend ? {} : styles.resendButtonDisabled),
            }}
          >
            {isLoading ? 'Sending...' : 'Resend code'}
          </button>
        )}

        <div style={styles.buttonContainer}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{ ...styles.button, ...styles.cancelButton }}
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            disabled={!canVerify}
            style={{
              ...styles.button,
              ...(canVerify ? styles.verifyButton : styles.verifyButtonDisabled),
            }}
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default TwoFactorModal
