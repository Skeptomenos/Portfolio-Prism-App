/**
 * SystemStatus Component
 * 
 * Displays engine connection status with sync controls.
 * Shows: status indicator, last sync time, sync button, progress bar.
 * Optionally expands to show engine health details.
 */

import { useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Zap, Globe } from 'lucide-react';
import { useAppStore, useEngineStatus, useSyncProgress } from '../store/useAppStore';
import { useSyncPortfolio, useEngineHealth } from '../hooks/usePortfolioData';
import { isTauri } from '../lib/tauri';
import type { EngineStatus } from '../types';

// =============================================================================
// Status Display Configuration
// =============================================================================

interface StatusConfig {
  color: string;
  label: string;
  glow: string;
}

function getStatusConfig(status: EngineStatus): StatusConfig {
  switch (status) {
    case 'idle':
      return { color: '#10b981', label: 'Connected', glow: 'rgba(16, 185, 129, 0.5)' };
    case 'processing':
      return { color: '#f59e0b', label: 'Syncing...', glow: 'rgba(245, 158, 11, 0.5)' };
    case 'error':
      return { color: '#ef4444', label: 'Error', glow: 'rgba(239, 68, 68, 0.5)' };
    case 'connecting':
      return { color: '#3b82f6', label: 'Connecting...', glow: 'rgba(59, 130, 246, 0.5)' };
    case 'disconnected':
    default:
      return { color: '#6b7280', label: 'Disconnected', glow: 'rgba(107, 114, 128, 0.5)' };
  }
}

// =============================================================================
// Time Formatting
// =============================================================================

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleDateString();
}

// =============================================================================
// Component
// =============================================================================

interface SystemStatusProps {
  /** Show expanded details by default */
  defaultExpanded?: boolean;
  /** Compact mode (no expand, minimal UI) */
  compact?: boolean;
}

export default function SystemStatus({ 
  defaultExpanded = false,
  compact = false 
}: SystemStatusProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Store state
  const engineStatus = useEngineStatus();
  const syncProgress = useSyncProgress();
  const lastSyncTime = useAppStore((state) => state.lastSyncTime);
  
  // Sync mutation
  const syncMutation = useSyncPortfolio();
  
  // Engine health query
  const { data: engineHealth } = useEngineHealth();
  
  // Derived state
  const statusConfig = getStatusConfig(engineStatus);
  const isSyncing = engineStatus === 'processing';
  const canSync = engineStatus === 'idle' || engineStatus === 'error';
  
  // Handlers
  const handleSync = () => {
    if (canSync) {
      syncMutation.mutate({ force: false });
    }
  };

  return (
    <div
      style={{
        padding: '12px',
        background: `${statusConfig.color}10`,
        border: `1px solid ${statusConfig.color}25`,
        borderRadius: '8px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header Row */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusConfig.color,
              boxShadow: `0 0 8px ${statusConfig.glow}`,
              animation: isSyncing ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {statusConfig.label}
          </span>
        </div>
        
        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={!canSync}
          title={canSync ? 'Sync portfolio' : 'Sync in progress...'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            padding: 0,
            background: canSync ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: '1px solid',
            borderColor: canSync ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: canSync ? '#3b82f6' : 'var(--text-tertiary)',
            cursor: canSync ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (canSync) {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)';
            }
          }}
          onMouseLeave={(e) => {
            if (canSync) {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
            }
          }}
        >
          <RefreshCw 
            size={14} 
            style={{ 
              animation: isSyncing ? 'spin 1s linear infinite' : 'none',
            }} 
          />
        </button>
        
        {/* Expand Button (if not compact) */}
        {!compact && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              padding: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      
      {/* Last Sync Time */}
      <p 
        style={{ 
          fontSize: '11px', 
          color: 'var(--text-tertiary)', 
          marginTop: '6px',
          marginBottom: 0,
        }}
      >
        Last sync: {formatRelativeTime(lastSyncTime)}
      </p>
      
      {/* Progress Bar (visible during sync) */}
      {isSyncing && syncProgress && (
        <div style={{ marginTop: '10px' }}>
          {/* Progress message */}
          <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
            {syncProgress.message}
          </p>
          
          {/* Progress bar container */}
          <div
            style={{
              height: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            {/* Progress bar fill */}
            <div
              style={{
                height: '100%',
                width: `${syncProgress.progress}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}
      
      {/* Expanded Details */}
      {isExpanded && !compact && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <DetailRow label="Version" value={engineHealth?.version ?? '...'} />
              <DetailRow label="Memory" value={engineHealth ? `${engineHealth.memoryUsageMb.toFixed(1)} MB` : '...'} />
              <DetailRow 
                label="Runtime" 
                value={isTauri() ? 'Native Shell' : 'Echo-Bridge'} 
                icon={isTauri() ? <Zap size={10} /> : <Globe size={10} />}
              />
            </div>

        </div>
      )}
      
      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface DetailRowProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {icon && <span style={{ color: 'var(--text-tertiary)' }}>{icon}</span>}
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {value}
        </span>
      </div>
    </div>
  );
}
