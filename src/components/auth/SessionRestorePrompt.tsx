/**
 * Session Restore Prompt
 * 
 * Glassmorphic prompt for restoring a saved Trade Republic session.
 */

import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { trGetAuthStatus, syncPortfolio } from '../../lib/ipc';
import type { SessionCheck } from '../../types';

const styles = {
  container: {
    maxWidth: '400px',
    margin: '0 auto',
    textAlign: 'center' as const,
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  icon: {
    color: '#10b981',
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
    marginBottom: '24px',
  },
  accountBox: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  accountLabel: {
    color: '#64748b',
    fontSize: '12px',
    marginBottom: '4px',
  },
  accountPhone: {
    color: '#f8fafc',
    fontSize: '16px',
    fontFamily: 'monospace',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    padding: '12px 16px',
    fontSize: '13px',
    marginBottom: '16px',
    textAlign: 'left' as const,
  },
  buttonContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  restoreButton: {
    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  freshLoginButton: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#94a3b8',
    padding: '12px 24px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  infoBox: {
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '24px',
    textAlign: 'left' as const,
  },
  infoTitle: {
    color: '#3b82f6',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  infoList: {
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.6,
    margin: 0,
    paddingLeft: '16px',
  },
};

interface SessionRestorePromptProps {
  sessionData: SessionCheck;
  onFreshLogin: () => void;
  onRestoreComplete: () => void;
}

export const SessionRestorePrompt: React.FC<SessionRestorePromptProps> = ({
  sessionData,
  onFreshLogin,
  onRestoreComplete,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { setAuthState, addToast, activePortfolioId } = useAppStore();

  const maskPhoneNumber = (phone?: string): string => {
    if (!phone) return '••• •••• ••••';
    
    if (phone.startsWith('+49')) {
      const lastFour = phone.slice(-4);
      return `+49 ••• ••••${lastFour}`;
    }
    
    const visibleChars = 4;
    const masked = '•'.repeat(Math.max(0, phone.length - visibleChars));
    return masked + phone.slice(-visibleChars);
  };

  const handleRestore = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authStatus = await trGetAuthStatus();
      
      if (authStatus.authState === 'authenticated') {
        setAuthState('authenticated');
        
        // Trigger portfolio sync
        try {
          await syncPortfolio(activePortfolioId, false);
          addToast({
            type: 'success',
            title: 'Session restored',
            message: 'Portfolio synced successfully',
          });
        } catch {
          addToast({
            type: 'warning',
            title: 'Session restored',
            message: 'Portfolio sync pending',
          });
        }
        
        onRestoreComplete();
      } else {
        setError('Session has expired. Please login again.');
        setTimeout(() => {
          onFreshLogin();
        }, 1500);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore session';
      setError(message);
      setAuthState('idle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFreshLogin = () => {
    setError(null);
    onFreshLogin();
  };

  return (
    <div style={styles.container}>
      <div style={styles.iconContainer}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={styles.icon}
        >
          <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
          <path d="M12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
        </svg>
      </div>

      <h2 style={styles.title}>Welcome back!</h2>
      <p style={styles.subtitle}>
        We found a saved session for your Trade Republic account
      </p>

      {sessionData.phoneNumber && (
        <div style={styles.accountBox}>
          <div style={styles.accountLabel}>Account</div>
          <div style={styles.accountPhone}>{maskPhoneNumber(sessionData.phoneNumber)}</div>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.buttonContainer}>
        <button
          onClick={handleRestore}
          disabled={isLoading}
          style={{
            ...styles.restoreButton,
            ...(isLoading ? styles.buttonDisabled : {}),
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {isLoading ? (
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
              Restoring...
            </>
          ) : (
            'Restore Session'
          )}
        </button>

        <button
          onClick={handleFreshLogin}
          disabled={isLoading}
          style={{
            ...styles.freshLoginButton,
            ...(isLoading ? styles.buttonDisabled : {}),
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = '#f8fafc';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          Login with different credentials
        </button>
      </div>

      <div style={styles.infoBox}>
        <div style={styles.infoTitle}>Session Restore</div>
        <ul style={styles.infoList}>
          <li>Restores your previous login without 2FA</li>
          <li>Portfolio data will be synced automatically</li>
          <li>Choose "Login with different credentials" if this fails</li>
        </ul>
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default SessionRestorePrompt;
