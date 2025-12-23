// 'critical' is used for automatic system error reports (ErrorBoundary, global handlers)
// 'functional', 'ui_ux', 'feature' are used for user-submitted feedback via FeedbackDialog
export type FeedbackType = 'critical' | 'functional' | 'ui_ux' | 'feature';

export interface FeedbackMetadata {
  version?: string;
  adapter?: string;
  error?: string;
  componentStack?: string;
  userAgent?: string;
  view?: string;
  platform?: string;
  environment?: 'tauri' | 'browser';
  positionCount?: number;
  trConnected?: boolean;
  lastSync?: string;
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

export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const proxyUrl = import.meta.env.VITE_API_PROXY_URL;
  
  console.log('[Feedback] Sending feedback...', { 
    type: payload.type, 
    proxyUrl: proxyUrl ? `${proxyUrl.substring(0, 30)}...` : 'NOT SET'
  });

  if (!proxyUrl) {
    console.warn('[Feedback] VITE_API_PROXY_URL not configured - using mock response');
    return { issue_url: 'https://github.com/mock-issue-url' };
  }

  const platform = navigator.platform || 'unknown';
  const isMac = platform.toLowerCase().includes('mac');
  const isWindows = platform.toLowerCase().includes('win');
  const platformName = isMac ? 'macOS' : isWindows ? 'Windows' : 'Linux';

  const requestBody = JSON.stringify({
    ...payload,
    metadata: {
      ...payload.metadata,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      version: import.meta.env.VITE_APP_VERSION || 'dev',
      platform: platformName,
    },
  });

  const response = await fetch(`${proxyUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error('[Feedback] Server error:', response.status, errorText);
    throw new Error(`Server error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log('[Feedback] Success! Issue created:', result.issue_url);
  return result;
}
