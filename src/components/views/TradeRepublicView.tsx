/**
 * Trade Republic View
 *
 * Main view for Trade Republic integration.
 * - When NOT authenticated: Shows login form or session restore
 * - When authenticated: Shows account status, sync button, and portfolio table
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../../store/useAppStore'
import { LoginForm, TwoFactorModal, SessionRestorePrompt } from '../auth'
import { PortfolioTable } from '../portfolio/PortfolioTable'
import { trCheckSavedSession, trLogout, syncPortfolio, getPositions, trLogin } from '../../lib/ipc'
import type { SessionCheck, AuthResponse, Position } from '../../types'

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  title: {
    color: '#f8fafc',
    fontSize: '28px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
  },
  statusConnected: {
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  statusDisconnected: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  accountCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '20px 24px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  accountInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap' as const,
  },
  accountItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  accountLabel: {
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  accountValue: {
    color: '#f8fafc',
    fontSize: '16px',
    fontWeight: 500,
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    color: '#fff',
  },
  secondaryButton: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
  },
  dangerButton: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: '18px',
    fontWeight: 600,
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  summaryCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '16px 20px',
  },
  summaryLabel: {
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: '24px',
    fontWeight: 600,
  },
  positive: {
    color: '#10b981',
  },
  negative: {
    color: '#ef4444',
  },
  authContainer: {
    maxWidth: '500px',
    margin: '60px auto',
    padding: '32px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
  },
  warningBanner: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#f59e0b',
    fontSize: '13px',
  },
}

export const TradeRepublicView: React.FC = () => {
  const {
    authState,
    setAuthState,
    activePortfolioId,
    addToast,
    hasUnsavedChanges,
    setHasUnsavedChanges,
  } = useAppStore()

  const [sessionData, setSessionData] = useState<SessionCheck | null>(null)
  const [loginCredentials, setLoginCredentials] = useState<{
    phone: string
    pin: string
    remember: boolean
  } | null>(null)
  const [authResponse, setAuthResponse] = useState<AuthResponse | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [localPositions, setLocalPositions] = useState<Position[]>([])

  // Fetch positions when authenticated
  const {
    data: positionsData,
    refetch: refetchPositions,
    isLoading: isLoadingPositions,
  } = useQuery({
    queryKey: ['positions', activePortfolioId],
    queryFn: () => getPositions(activePortfolioId),
    enabled: authState === 'authenticated',
    staleTime: 30000,
  })

  // Update local positions when data changes
  useEffect(() => {
    if (positionsData?.positions) {
      setLocalPositions(positionsData.positions)
    }
  }, [positionsData])

  useEffect(() => {
    const loadSessionData = async () => {
      if (authState === 'idle') {
        try {
          const session = await trCheckSavedSession()
          setSessionData(session)
        } catch (error) {
          console.error('[TradeRepublicView] Failed to load session data:', error)
        }
      }
    }
    loadSessionData()
  }, [authState])

  // Handle login success
  const handleLoginSuccess = useCallback(
    (response: AuthResponse, credentials?: { phone: string; pin: string; remember: boolean }) => {
      setAuthResponse(response)
      if (credentials) {
        setLoginCredentials(credentials)
      }
    },
    []
  )

  // Handle 2FA success - auto-sync after login
  const handleTwoFactorSuccess = useCallback(async () => {
    setAuthState('authenticated')
    setLoginCredentials(null)
    setAuthResponse(null)

    // Auto-sync after successful login
    setIsSyncing(true)
    addToast({
      type: 'info',
      title: 'Syncing portfolio',
      message: 'Fetching your positions from Trade Republic...',
    })

    try {
      const result = await syncPortfolio(activePortfolioId, false)
      addToast({
        type: 'success',
        title: 'Portfolio synced',
        message: `${result.syncedPositions} positions loaded`,
      })
      refetchPositions()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      addToast({
        type: 'error',
        title: 'Auto-sync failed',
        message: `${message}. Click "Sync Now" to retry.`,
      })
    } finally {
      setIsSyncing(false)
    }
  }, [setAuthState, refetchPositions, activePortfolioId, addToast])

  // Handle session restore - auto-sync after restore
  const handleRestoreComplete = useCallback(async () => {
    setAuthState('authenticated')

    // Auto-sync after session restore
    setIsSyncing(true)
    addToast({
      type: 'info',
      title: 'Syncing portfolio',
      message: 'Fetching your positions from Trade Republic...',
    })

    try {
      const result = await syncPortfolio(activePortfolioId, false)
      addToast({
        type: 'success',
        title: 'Portfolio synced',
        message: `${result.syncedPositions} positions loaded`,
      })
      refetchPositions()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      addToast({
        type: 'error',
        title: 'Auto-sync failed',
        message: `${message}. Click "Sync Now" to retry.`,
      })
      // Still refetch in case there's cached data
      refetchPositions()
    } finally {
      setIsSyncing(false)
    }
  }, [setAuthState, refetchPositions, activePortfolioId, addToast])

  // Handle fresh login
  const handleFreshLogin = useCallback(() => {
    setSessionData({ hasSession: false, prompt: 'login_required' })
  }, [])

  // Handle sync
  const handleSync = useCallback(async () => {
    if (hasUnsavedChanges) {
      addToast({
        type: 'warning',
        title: 'Unsaved changes',
        message: 'Please save your changes before syncing',
      })
      return
    }

    setIsSyncing(true)
    try {
      const result = await syncPortfolio(activePortfolioId, false)
      addToast({
        type: 'success',
        title: 'Portfolio synced',
        message: `${result.syncedPositions} positions updated`,
      })
      refetchPositions()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      addToast({
        type: 'error',
        title: 'Sync failed',
        message,
      })

      // Check if it's an auth error
      if (message.includes('auth') || message.includes('session')) {
        setAuthState('idle')
      }
    } finally {
      setIsSyncing(false)
    }
  }, [activePortfolioId, hasUnsavedChanges, addToast, refetchPositions, setAuthState])

  // Handle logout
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      await trLogout()
      setAuthState('idle')
      setSessionData(null)
      setLocalPositions([])
      addToast({
        type: 'info',
        title: 'Logged out',
        message: 'Session cleared successfully',
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Logout failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsLoggingOut(false)
    }
  }, [addToast, setAuthState])

  // Handle position update (local only for now)
  const handlePositionUpdate = useCallback(
    (updatedPosition: Position) => {
      setLocalPositions((prev) =>
        prev.map((p) => (p.isin === updatedPosition.isin ? updatedPosition : p))
      )
      setHasUnsavedChanges(true)
    },
    [setHasUnsavedChanges]
  )

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)
  }

  // Render auth content
  const renderAuthContent = () => {
    // Show 2FA modal
    if (authState === 'waiting_2fa' && loginCredentials && authResponse) {
      return (
        <TwoFactorModal
          isOpen={true}
          onClose={() => {
            setAuthState('idle')
            setLoginCredentials(null)
            setAuthResponse(null)
          }}
          onSuccess={handleTwoFactorSuccess}
          onResendRequest={async () => {
            // SECURITY: Credentials handled here, not exposed as props to child
            if (!loginCredentials) throw new Error('No credentials available')
            const response = await trLogin(
              loginCredentials.phone,
              loginCredentials.pin,
              loginCredentials.remember
            )
            if (response.authState !== 'waiting_2fa') {
              throw new Error('Failed to resend code')
            }
            return response.countdown || 30
          }}
          initialCountdown={authResponse.countdown}
        />
      )
    }

    // Show session restore prompt
    if (sessionData?.hasSession) {
      return (
        <div style={styles.authContainer}>
          <SessionRestorePrompt
            sessionData={sessionData}
            onFreshLogin={handleFreshLogin}
            onRestoreComplete={handleRestoreComplete}
          />
        </div>
      )
    }

    // Show login form
    return (
      <div style={styles.authContainer}>
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      </div>
    )
  }

  // Render authenticated content
  const renderAuthenticatedContent = () => {
    const totalValue = positionsData?.totalValue || 0
    const totalPnl = positionsData?.totalPnl || 0
    const totalPnlPercent = positionsData?.totalPnlPercent || 0
    const lastSyncTime = positionsData?.lastSyncTime

    return (
      <>
        {/* Account Card */}
        <div style={styles.accountCard}>
          <div style={styles.accountInfo}>
            <div style={styles.accountItem}>
              <div style={styles.accountLabel}>Status</div>
              <div style={{ ...styles.statusBadge, ...styles.statusConnected }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                Connected
              </div>
            </div>
            <div style={styles.accountItem}>
              <div style={styles.accountLabel}>Last Sync</div>
              <div style={styles.accountValue}>
                {lastSyncTime ? new Date(lastSyncTime).toLocaleString('de-DE') : 'Never'}
              </div>
            </div>
            <div style={styles.accountItem}>
              <div style={styles.accountLabel}>Positions</div>
              <div style={styles.accountValue}>{localPositions.length}</div>
            </div>
          </div>
          <div style={styles.buttonGroup}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(isSyncing ? styles.buttonDisabled : {}),
              }}
            >
              {isSyncing ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 21h5v-5" />
                  </svg>
                  Sync Now
                </>
              )}
            </button>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                ...styles.button,
                ...styles.dangerButton,
                ...(isLoggingOut ? styles.buttonDisabled : {}),
              }}
            >
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Warning banner for unsaved changes */}
        {hasUnsavedChanges && (
          <div style={styles.warningBanner}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            You have unsaved changes. Sync is disabled until changes are saved.
          </div>
        )}

        {/* Summary Cards */}
        <div style={styles.summary}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total Value</div>
            <div style={styles.summaryValue}>{formatCurrency(totalValue)}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Total P&L</div>
            <div
              style={{
                ...styles.summaryValue,
                ...(totalPnl >= 0 ? styles.positive : styles.negative),
              }}
            >
              {formatCurrency(totalPnl)}
            </div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>P&L %</div>
            <div
              style={{
                ...styles.summaryValue,
                ...(totalPnlPercent >= 0 ? styles.positive : styles.negative),
              }}
            >
              {totalPnlPercent >= 0 ? '+' : ''}
              {totalPnlPercent.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Portfolio Table */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Portfolio Positions</h2>
          </div>
          {isLoadingPositions ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '48px' }}>
              Loading positions...
            </div>
          ) : (
            <PortfolioTable positions={localPositions} onPositionUpdate={handlePositionUpdate} />
          )}
        </div>

        {/* Spin animation for sync button */}
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: '#10b981' }}
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Trade Republic
        </h1>
        {authState === 'authenticated' && (
          <div style={{ ...styles.statusBadge, ...styles.statusConnected }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            Connected
          </div>
        )}
      </div>

      {authState === 'authenticated' ? renderAuthenticatedContent() : renderAuthContent()}
    </div>
  )
}

export default TradeRepublicView
