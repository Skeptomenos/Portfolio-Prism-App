import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import { Dashboard } from './features/dashboard'
import { XRayView } from './features/xray'
import HealthView from './components/views/HealthView'

import { HoldingsView } from './features/portfolio'

import { TradeRepublicView } from './features/integrations'
import { ToastContainer } from './components/ui/Toast'
import { FeedbackDialog } from './components/feedback/FeedbackDialog'
import { useCurrentView, useAppStore, useSetSessionId } from './store/useAppStore'
import { useTauriEvents } from './hooks/useTauriEvents'
import { getEnvironment, trCheckSavedSession, trGetAuthStatus, getEngineHealth } from './lib/ipc'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { logger } from './lib/logger'

// Re-export ViewType from types for backward compatibility
export type { ViewType } from './types'

function App() {
  const currentView = useCurrentView()
  const setCurrentView = useAppStore((state) => state.setCurrentView)
  const setAuth = useAppStore((state) => state.setAuthState)
  const setSavedPhone = useAppStore((state) => state.setSavedPhone)
  const setSessionId = useSetSessionId()
  const isFeedbackOpen = useAppStore((state) => state.isFeedbackOpen)
  const closeFeedback = useAppStore((state) => state.closeFeedback)

  // Initialize Tauri event listeners
  useTauriEvents()

  useEffect(() => {
    const initApp = async () => {
      try {
        const health = await getEngineHealth()
        if (health.sessionId) {
          setSessionId(health.sessionId)
        }

        const session = await trCheckSavedSession()

        if (session.hasSession) {
          const status = await trGetAuthStatus()
          if (status.authState === 'authenticated') {
            setAuth('authenticated')
            setSavedPhone(session.phoneNumber || null)
            return
          }
        }

        setAuth('idle')
        setCurrentView('trade-republic')
      } catch (error) {
        logger.error('[App] Initialization failed', error instanceof Error ? error : undefined)
        setAuth('idle')
        setCurrentView('trade-republic')
      }
    }

    logger.info(`[App] Running in ${getEnvironment()} environment`)

    initApp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'trade-republic':
        return <TradeRepublicView />
      case 'xray':
        return <XRayView />

      case 'health':
        return <HealthView />
      case 'holdings':
        return <HoldingsView />
      default:
        return <Dashboard />
    }
  }

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>{renderView()}</main>

        {/* Toast Notifications */}
        <ToastContainer />

        {/* Global Feedback Dialog */}
        <FeedbackDialog isOpen={isFeedbackOpen} onClose={closeFeedback} />
      </div>
    </ErrorBoundary>
  )
}

export default App
