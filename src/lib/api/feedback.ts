export type FeedbackType = 'critical' | 'functional' | 'ui_ux' | 'feature';

export interface FeedbackMetadata {
  version?: string;
  adapter?: string;
  error?: string;
  componentStack?: string;
  userAgent?: string;
  [key: string]: unknown;
}

export interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  metadata?: FeedbackMetadata;
}

export interface FeedbackResponse {
  issue_url: string;
}

/**
 * Sends feedback or crash reports to the Cloudflare Worker proxy,
 * which creates a GitHub Issue.
 */
export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const proxyUrl = import.meta.env.VITE_API_PROXY_URL;

  if (!proxyUrl) {
    console.warn('VITE_API_PROXY_URL not set. Feedback will not be sent.');
    // Mock response for dev without configured proxy
    return { issue_url: 'https://github.com/mock-issue-url' };
  }

  try {
    const response = await fetch(`${proxyUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        metadata: {
          ...payload.metadata,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          version: import.meta.env.VITE_APP_VERSION || 'dev',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Feedback submission failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to send feedback:', error);
    throw error;
  }
}
