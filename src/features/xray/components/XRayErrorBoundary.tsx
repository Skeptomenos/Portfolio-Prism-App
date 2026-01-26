import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Send, Bug } from 'lucide-react'
import { sendFeedback, type FeedbackMetadata } from '@/lib/api/feedback'
import { useAppStore } from '@/store/useAppStore'
import { scrubObject } from '@/lib/scrubber'
import { logger } from '@/lib/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  isReporting: boolean
  isReported: boolean
}

/**
 * Feature-specific ErrorBoundary for X-Ray view.
 *
 * WHY: X-Ray errors should not crash the entire app. This boundary provides:
 * - Contextual fallback UI specific to pipeline operations
 * - Option to retry the X-Ray view without full app reload
 * - Automatic error reporting with pipeline context
 */
export class XRayErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isReporting: false,
    isReported: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo })
    logger.error('X-Ray view error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      feature: 'xray',
    })

    const { telemetryMode } = useAppStore.getState()
    if (telemetryMode === 'auto') {
      this.handleReport()
    }
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isReporting: false,
      isReported: false,
    })
  }

  private handleReport = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    if (!error) return

    this.setState({ isReporting: true })

    try {
      const scrubbedMetadata = scrubObject({
        name: error.name,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
        feature: 'xray',
        context: 'Pipeline Operations',
      }) as FeedbackMetadata

      await sendFeedback({
        type: 'critical',
        message: `X-Ray Error: ${error.message}`,
        metadata: scrubbedMetadata,
      })
      this.setState({ isReported: true })
    } catch (err) {
      logger.error('Failed to report X-Ray error', err instanceof Error ? err : undefined)
    } finally {
      this.setState({ isReporting: false })
    }
  }

  public render(): ReactNode {
    const { hasError, error, isReporting, isReported } = this.state

    if (hasError) {
      return (
        <div
          className="animate-fade-in"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            maxWidth: '480px',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 24px auto',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bug style={{ width: '32px', height: '32px', color: '#ef4444' }} />
          </div>

          <h3
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)',
            }}
          >
            Pipeline View Error
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginBottom: '16px',
              lineHeight: 1.5,
            }}
          >
            Something went wrong while loading the pipeline operations view. This doesn't affect
            your portfolio data.
          </p>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: '8px',
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '4px',
                }}
              >
                <AlertTriangle style={{ width: '14px', height: '14px', color: '#fca5a5' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5' }}>
                  {error.name}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                {error.message}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={this.handleRetry}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <RefreshCw style={{ width: '16px', height: '16px' }} />
              Try Again
            </button>

            {!isReported && (
              <button
                onClick={this.handleReport}
                disabled={isReporting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: isReporting ? 'not-allowed' : 'pointer',
                  opacity: isReporting ? 0.6 : 1,
                }}
              >
                <Send style={{ width: '14px', height: '14px' }} />
                {isReporting ? 'Sending...' : 'Report Issue'}
              </button>
            )}

            {isReported && (
              <p style={{ fontSize: '12px', color: '#4ade80' }}>✓ Issue reported. Thank you!</p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
