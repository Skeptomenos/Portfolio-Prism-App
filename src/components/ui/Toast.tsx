/**
 * Toast Notification System
 * 
 * Glassmorphic toast notifications positioned top-right.
 * Auto-dismisses after duration (default 4 seconds).
 */

import React from 'react';
import { useToasts, useDismissToast } from '../../store/useAppStore';
import type { Toast as ToastType } from '../../types';

// Styles
const styles = {
  container: {
    position: 'fixed' as const,
    top: '16px',
    right: '16px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    pointerEvents: 'none' as const,
  },
  toast: {
    background: 'rgba(15, 20, 32, 0.95)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
    padding: '12px 16px',
    minWidth: '280px',
    maxWidth: '400px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    animation: 'slideInRight 0.3s ease-out',
    pointerEvents: 'auto' as const,
  },
  iconContainer: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#f8fafc',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '2px',
  },
  message: {
    color: '#94a3b8',
    fontSize: '13px',
    lineHeight: 1.4,
  },
  closeButton: {
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
};

const typeConfig = {
  success: {
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warning: {
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

interface ToastItemProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const config = typeConfig[toast.type];

  return (
    <div
      style={{
        ...styles.toast,
        borderLeft: `3px solid ${config.color}`,
      }}
    >
      <div
        style={{
          ...styles.iconContainer,
          backgroundColor: config.bgColor,
          color: config.color,
        }}
      >
        {config.icon}
      </div>
      <div style={styles.content}>
        <div style={styles.title}>{toast.title}</div>
        {toast.message && <div style={styles.message}>{toast.message}</div>}
      </div>
      <button
        style={styles.closeButton}
        onClick={() => onDismiss(toast.id)}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useToasts();
  const dismissToast = useDismissToast();

  if (toasts.length === 0) return null;

  return (
    <>
      <style>
        {`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div style={styles.container}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </>
  );
};

export default ToastContainer;
