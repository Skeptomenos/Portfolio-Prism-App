import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/queryClient'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { logEvent } from './lib/ipc'
import { logger } from './lib/logger'
import App from './App'
import './styles.css'

// Global error handlers - fire-and-forget to avoid infinite loops if IPC fails
window.onerror = (message, source, lineno, colno, error) => {
  try {
    logEvent(
      'CRITICAL',
      `Unhandled JS Error: ${message}`,
      {
        source,
        lineno,
        colno,
        stack: error?.stack,
      },
      'ui',
      'crash'
    ).catch(() => {
      /* ignore IPC failures */
    })
  } catch {
    /* ignore synchronous errors */
  }
}

window.onunhandledrejection = (event) => {
  try {
    logEvent(
      'ERROR',
      `Unhandled Promise Rejection: ${event.reason}`,
      {
        reason: String(event.reason),
      },
      'ui',
      'crash'
    ).catch(() => {
      /* ignore IPC failures */
    })
  } catch {
    /* ignore synchronous errors */
  }
}

// Mount React app with fallback for missing root element
const rootElement = document.getElementById('root')
if (!rootElement) {
  // Fallback: create root element if missing (defensive)
  const fallbackRoot = document.createElement('div')
  fallbackRoot.id = 'root'
  document.body.appendChild(fallbackRoot)
  logger.error('[main] Root element not found in DOM, created fallback')
  ReactDOM.createRoot(fallbackRoot).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      </QueryClientProvider>
    </React.StrictMode>
  )
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        {/* DevTools - only visible in development */}
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      </QueryClientProvider>
    </React.StrictMode>
  )
}
