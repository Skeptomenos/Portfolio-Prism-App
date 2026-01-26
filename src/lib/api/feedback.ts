import { scrubText, scrubObject } from '@/lib/scrubber'
import { logger } from '@/lib/logger'

// 'critical' is used for automatic system error reports (ErrorBoundary, global handlers)
// 'functional', 'ui_ux', 'feature' are used for user-submitted feedback via FeedbackDialog
export type FeedbackType = 'critical' | 'functional' | 'ui_ux' | 'feature'

// Request timeout in milliseconds (30 seconds)
const REQUEST_TIMEOUT_MS = 30_000

export interface FeedbackMetadata {
  version?: string
  adapter?: string
  error?: string
  componentStack?: string
  userAgent?: string
  view?: string
  platform?: string
  environment?: 'tauri' | 'browser'
  positionCount?: number
  trConnected?: boolean
  lastSync?: string
  [key: string]: unknown
}

export interface FeedbackPayload {
  type: FeedbackType
  message: string
  metadata?: FeedbackMetadata
}

export interface FeedbackResponse {
  issue_url: string
}

export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const workerUrl = import.meta.env.VITE_WORKER_URL

  logger.info('[Feedback] Sending feedback...', {
    type: payload.type,
    workerUrl: workerUrl ? `${workerUrl.substring(0, 30)}...` : 'NOT SET',
  })

  if (!workerUrl) {
    logger.warn('[Feedback] VITE_WORKER_URL not configured - using mock response')
    return { issue_url: 'https://github.com/mock-issue-url' }
  }

  const platform = navigator.platform || 'unknown'
  const isMac = platform.toLowerCase().includes('mac')
  const isWindows = platform.toLowerCase().includes('win')
  const platformName = isMac ? 'macOS' : isWindows ? 'Windows' : 'Linux'

  // SECURITY: Scrub PII from user message and metadata before sending to external service
  // Users may accidentally include phone numbers, emails, IBANs, or file paths in feedback
  const scrubbedMessage = scrubText(payload.message)
  const scrubbedMetadata = payload.metadata
    ? (scrubObject(payload.metadata) as FeedbackMetadata)
    : undefined

  const requestBody = JSON.stringify({
    ...payload,
    message: scrubbedMessage,
    metadata: {
      ...scrubbedMetadata,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      version: import.meta.env.VITE_APP_VERSION || 'dev',
      platform: platformName,
    },
  })

  // Create AbortController for request timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${workerUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      logger.error(`[Feedback] Server error: ${response.status} ${errorText}`)
      throw new Error(`Server error (${response.status}): ${errorText}`)
    }

    const result = await response.json()
    logger.info('[Feedback] Success! Issue created', { issueUrl: result.issue_url })
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
