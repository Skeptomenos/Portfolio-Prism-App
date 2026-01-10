import { AlertTriangle, RefreshCw, MessageCircle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  showContactSupport?: boolean
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  showContactSupport = true,
}: ErrorStateProps) {
  const openFeedback = useAppStore((state) => state.openFeedback)

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
      </div>

      <h3 className="text-lg font-semibold text-slate-100 mb-2">{title}</h3>
      <p className="text-slate-400 max-w-md mb-6">{message}</p>

      <div className="flex gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}

        {showContactSupport && (
          <button
            onClick={openFeedback}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/10"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Support
          </button>
        )}
      </div>
    </div>
  )
}

export function LoadingError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="Failed to load data"
      message="We couldn't load the data you requested. Please check your connection and try again."
      onRetry={onRetry}
    />
  )
}

export function ConnectionError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="Connection lost"
      message="The connection to the analytics engine was lost. Please try reconnecting."
      onRetry={onRetry}
    />
  )
}
