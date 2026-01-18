/**
 * Trade Republic Login Form
 *
 * Glassmorphic login form for phone + PIN authentication.
 */

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { trLogin, trGetStoredCredentials } from '../../lib/ipc'
import { scrubText } from '../../lib/scrubber'
import type { AuthResponse } from '../../types'

const styles = {
  container: {
    maxWidth: '400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: 500,
  },
  input: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#f8fafc',
    padding: '12px 16px',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.2s',
  },
  inputFocus: {
    borderColor: '#10b981',
    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.15)',
  },
  hint: {
    color: '#64748b',
    fontSize: '12px',
    marginTop: '4px',
  },
  checkboxContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: '#10b981',
    cursor: 'pointer',
  },
  checkboxLabel: {
    color: '#cbd5e1',
    fontSize: '14px',
    cursor: 'pointer',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    padding: '12px 16px',
    fontSize: '13px',
  },
  button: {
    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: '8px',
  },
  buttonDisabled: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    cursor: 'not-allowed',
  },
  buttonHover: {
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
  },
}

interface LoginFormProps {
  onLoginSuccess?: (
    response: AuthResponse,
    credentials: { phone: string; pin: string; remember: boolean }
  ) => void
  onLoginError?: (error: string) => void
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, onLoginError }) => {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [remember, setRemember] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)

  const { setAuthState, setAuthError } = useAppStore()

  useEffect(() => {
    if (credentialsLoaded) return

    const loadStoredCredentials = async () => {
      try {
        const result = await trGetStoredCredentials()
        if (result.hasCredentials && result.phone && result.pin) {
          setPhone(result.phone)
          setPin(result.pin)
          setRemember(true)
        }
      } catch {
        // Intentional: graceful degradation
      } finally {
        setCredentialsLoaded(true)
      }
    }

    loadStoredCredentials()
  }, [credentialsLoaded])

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^\+49\d{9,15}$/
    return phoneRegex.test(phone.replace(/\s/g, ''))
  }

  const validatePin = (pin: string): boolean => {
    return /^\d{4}$/.test(pin)
  }

  const formatPhone = (value: string): string => {
    // Remove non-digits except +
    let cleaned = value.replace(/[^\d+]/g, '')

    // Ensure it starts with +49
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('49')) {
        cleaned = '+' + cleaned
      } else if (cleaned.startsWith('0')) {
        cleaned = '+49' + cleaned.slice(1)
      } else {
        cleaned = '+49' + cleaned
      }
    }

    return cleaned
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value)
    setPhone(formatted)
    setError(null)
  }

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(value)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    const cleanPhone = phone.replace(/\s/g, '')

    if (!validatePhone(cleanPhone)) {
      setError('Please enter a valid German phone number (+49...)')
      return
    }

    if (!validatePin(pin)) {
      setError('PIN must be exactly 4 digits')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const loginPromise = trLogin(cleanPhone, pin, remember)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Login request timed out. Trade Republic might be slow.')),
          45000
        )
      )

      const response = (await Promise.race([loginPromise, timeoutPromise])) as AuthResponse

      setAuthState(response.authState)

      if (response.authState === 'waiting_2fa') {
        onLoginSuccess?.(response, { phone: cleanPhone, pin, remember })
      } else if (response.authState === 'error') {
        // SECURITY: Scrub any PII that might be in backend error messages
        const msg = scrubText(response.message || 'Login failed')
        setError(msg)
        setAuthError(msg)
        onLoginError?.(msg)
      }
    } catch (err) {
      // SECURITY: Scrub any PII that might be in backend error messages
      const rawMessage = err instanceof Error ? err.message : 'Login failed'
      const message = scrubText(rawMessage)

      if (message.includes('rate limit') || message.includes('TOO_MANY_REQUESTS')) {
        setError('Trade Republic rate limit reached. Please wait 2-5 minutes before trying again.')
      } else {
        setError(message)
      }

      setAuthError(message)
      setAuthState('idle')
      onLoginError?.(message)
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = phone.length >= 10 && pin.length === 4 && !isLoading

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Connect to Trade Republic</h2>
        <p style={styles.subtitle}>Enter your phone number and PIN to sync your portfolio</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.fieldGroup}>
          <label htmlFor="phone" style={styles.label}>
            Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="+49 176 12345678"
            disabled={isLoading}
            autoComplete="tel"
            inputMode="tel"
            style={styles.input}
            onFocus={(e) => {
              e.target.style.borderColor = '#10b981'
              e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              e.target.style.boxShadow = 'none'
            }}
          />
          <span style={styles.hint}>German phone number with country code</span>
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="pin" style={styles.label}>
            PIN
          </label>
          <input
            id="pin"
            type="password"
            value={pin}
            onChange={handlePinChange}
            placeholder="••••"
            maxLength={4}
            disabled={isLoading}
            autoComplete="current-password"
            inputMode="numeric"
            style={styles.input}
            onFocus={(e) => {
              e.target.style.borderColor = '#10b981'
              e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              e.target.style.boxShadow = 'none'
            }}
          />
          <span style={styles.hint}>4-digit PIN from your Trade Republic app</span>
        </div>

        <div style={styles.checkboxContainer}>
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={isLoading}
            style={styles.checkbox}
          />
          <label htmlFor="remember" style={styles.checkboxLabel}>
            Remember this device
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            ...styles.button,
            ...(canSubmit ? {} : styles.buttonDisabled),
          }}
          onMouseEnter={(e) => {
            if (canSubmit) {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {isLoading ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  )
}

export default LoginForm
