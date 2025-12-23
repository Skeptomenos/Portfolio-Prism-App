/**
 * Pipeline Progress SSE Hook
 * 
 * React hook for subscribing to Server-Sent Events from the Python backend
 * to receive real-time pipeline progress updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type PipelinePhase = 
  | 'idle' 
  | 'sync' 
  | 'loading' 
  | 'decomposition' 
  | 'enrichment' 
  | 'aggregation' 
  | 'reporting' 
  | 'complete';

export interface PipelineProgressState {
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Current pipeline phase */
  phase: PipelinePhase;
  /** Whether connected to SSE endpoint */
  isConnected: boolean;
  /** Error message if connection failed */
  error: string | null;
}

interface SSEProgressEvent {
  type: 'progress';
  progress: number;
  message: string;
  phase: string;
}

interface SSEConnectedEvent {
  type: 'connected';
  message?: string;
}

interface SSEHeartbeatEvent {
  type: 'heartbeat';
  timestamp?: string;
}

type SSEEvent = SSEProgressEvent | SSEConnectedEvent | SSEHeartbeatEvent;

// =============================================================================
// Constants
// =============================================================================

const SSE_ENDPOINT = 'http://127.0.0.1:5001/events';
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const RETRY_MULTIPLIER = 2;

// =============================================================================
// Initial State
// =============================================================================

const initialState: PipelineProgressState = {
  progress: 0,
  message: '',
  phase: 'idle',
  isConnected: false,
  error: null,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Subscribe to pipeline progress updates via Server-Sent Events.
 * 
 * Connects to the Python backend SSE endpoint and provides real-time
 * progress updates during pipeline execution.
 * 
 * @param enabled - Whether to enable the SSE connection (default: true)
 * @returns PipelineProgressState with current progress, phase, and connection status
 * 
 * @example
 * ```tsx
 * const { progress, message, phase, isConnected, error } = usePipelineProgress();
 * 
 * return (
 *   <div>
 *     <ProgressBar value={progress} />
 *     <span>{message}</span>
 *     {error && <ErrorMessage>{error}</ErrorMessage>}
 *   </div>
 * );
 * ```
 */
export function usePipelineProgress(enabled: boolean = true): PipelineProgressState {
  const [state, setState] = useState<PipelineProgressState>(initialState);
  
  // Refs for managing reconnection
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /**
   * Parse incoming SSE event data
   */
  const parseEventData = useCallback((data: string): SSEEvent | null => {
    try {
      return JSON.parse(data) as SSEEvent;
    } catch (err) {
      console.warn('[SSE] Failed to parse event data:', data, err);
      return null;
    }
  }, []);

  /**
   * Validate and normalize phase string to PipelinePhase type
   */
  const normalizePhase = useCallback((phase: string): PipelinePhase => {
    const validPhases: PipelinePhase[] = [
      'idle', 'sync', 'loading', 'decomposition', 
      'enrichment', 'aggregation', 'reporting', 'complete'
    ];
    
    const normalized = phase.toLowerCase() as PipelinePhase;
    return validPhases.includes(normalized) ? normalized : 'idle';
  }, []);

  /**
   * Handle incoming SSE events
   */
  const handleEvent = useCallback((event: SSEEvent) => {
    if (!mountedRef.current) return;

    switch (event.type) {
      case 'connected':
        console.log('[SSE] Connected to pipeline progress stream');
        setState(prev => ({
          ...prev,
          isConnected: true,
          error: null,
        }));
        // Reset retry delay on successful connection
        retryDelayRef.current = INITIAL_RETRY_DELAY;
        break;

      case 'progress':
        setState(prev => ({
          ...prev,
          progress: Math.min(100, Math.max(0, event.progress)),
          message: event.message || '',
          phase: normalizePhase(event.phase),
          isConnected: true,
          error: null,
        }));
        break;

      case 'heartbeat':
        // Heartbeat keeps connection alive, no state update needed
        console.debug('[SSE] Heartbeat received');
        break;

      default:
        console.debug('[SSE] Unknown event type:', event);
    }
  }, [normalizePhase]);

  /**
   * Connect to SSE endpoint with retry logic
   */
  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    console.log('[SSE] Connecting to pipeline progress stream...');

    try {
      const eventSource = new EventSource(SSE_ENDPOINT);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[SSE] Connection opened');
      };

      eventSource.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        const parsed = parseEventData(event.data);
        if (parsed) {
          handleEvent(parsed);
        }
      };

      eventSource.onerror = (error) => {
        if (!mountedRef.current) return;

        console.error('[SSE] Connection error:', error);
        
        // Close the failed connection
        eventSource.close();
        eventSourceRef.current = null;

        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'Connection to pipeline lost. Reconnecting...',
        }));

        // Schedule reconnection with exponential backoff
        const delay = retryDelayRef.current;
        console.log(`[SSE] Reconnecting in ${delay}ms...`);
        
        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && enabled) {
            connect();
          }
        }, delay);

        // Increase delay for next retry (exponential backoff)
        retryDelayRef.current = Math.min(
          retryDelayRef.current * RETRY_MULTIPLIER,
          MAX_RETRY_DELAY
        );
      };

    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: err instanceof Error ? err.message : 'Failed to connect',
      }));
    }
  }, [enabled, parseEventData, handleEvent]);

  /**
   * Disconnect from SSE endpoint
   */
  const disconnect = useCallback(() => {
    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Close EventSource connection
    if (eventSourceRef.current) {
      console.log('[SSE] Disconnecting from pipeline progress stream');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Reset retry delay
    retryDelayRef.current = INITIAL_RETRY_DELAY;
  }, []);

  // =============================================================================
  // Effects
  // =============================================================================

  /**
   * Manage connection lifecycle
   */
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  /**
   * Handle visibility change - reconnect when tab becomes visible
   */
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !eventSourceRef.current) {
        console.log('[SSE] Tab visible, reconnecting...');
        retryDelayRef.current = INITIAL_RETRY_DELAY;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, connect]);

  return state;
}

// =============================================================================
// Utility Hook: Manual Control
// =============================================================================

/**
 * Extended hook with manual connection control.
 * 
 * Use this when you need to manually connect/disconnect from the SSE stream,
 * for example when the pipeline is only active during certain operations.
 */
export function usePipelineProgressWithControl() {
  const [enabled, setEnabled] = useState(false);
  const state = usePipelineProgress(enabled);

  const connect = useCallback(() => setEnabled(true), []);
  const disconnect = useCallback(() => setEnabled(false), []);

  return {
    ...state,
    connect,
    disconnect,
    enabled,
  };
}

export default usePipelineProgress;
