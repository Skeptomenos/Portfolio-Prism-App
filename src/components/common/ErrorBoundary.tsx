import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Send, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sendFeedback } from '@/lib/api/feedback';
import { useAppStore } from '@/store/useAppStore';
import { scrubObject } from '@/lib/scrubber';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isReporting: boolean;
  isReported: boolean;
  showReview: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isReporting: false,
    isReported: false,
    showReview: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, isReporting: false, isReported: false, showReview: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error('Uncaught error:', error, errorInfo);

    // Auto-report if telemetry mode is 'auto'
    const { telemetryMode } = useAppStore.getState();
    if (telemetryMode === 'auto') {
      this.handleReport();
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReport = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    this.setState({ isReporting: true });

    try {
      const scrubbedMetadata = scrubObject({
        name: error.name,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
      });

      await sendFeedback({
        type: 'critical',
        message: `App Crash: ${error.message}`,
        metadata: scrubbedMetadata,
      });
      this.setState({ isReported: true, showReview: false });
    } catch (err) {
      console.error('Failed to report crash:', err);
      alert('Failed to send report automatically. Please check your internet connection.');
    } finally {
      this.setState({ isReporting: false });
    }
  };

  private toggleReview = () => {
    this.setState(prev => ({ showReview: !prev.showReview }));
  };

  public render() {
    const { hasError, error, errorInfo, isReporting, isReported, showReview } = this.state;
    
    if (hasError) {
      const scrubbedData = scrubObject({
        error: error?.message,
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
      });

      return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-900 p-4 font-sans text-gray-100">
          <div className="w-full max-w-md rounded-lg border border-red-900/50 bg-red-950/10 p-6 shadow-2xl backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-900/20">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-red-500">Something went wrong</h2>
              <p className="mb-4 text-sm text-gray-400">
                An unexpected error occurred and the application has crashed.
              </p>
            </div>
            
            <AnimatePresence mode="wait">
              {!showReview ? (
                <motion.div 
                  key="error-info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 max-h-40 overflow-auto rounded-md bg-black/30 p-4 text-xs font-mono"
                >
                  <p className="font-bold text-red-400 mb-1">{error?.name}</p>
                  <p className="text-gray-300">{error?.message}</p>
                </motion.div>
              ) : (
                <motion.div 
                  key="review-info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 max-h-60 overflow-auto rounded-md bg-black/50 p-4 text-[10px] font-mono text-gray-400"
                >
                  <p className="mb-2 font-bold text-blue-400">Scrubbed Report Data:</p>
                  <pre>{JSON.stringify(scrubbedData, null, 2)}</pre>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-3">
              <button 
                onClick={this.handleReport} 
                disabled={isReported || isReporting}
                className={`flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors 
                  ${isReported 
                    ? 'bg-green-600/20 text-green-400 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700 text-white'}`}
              >
                {isReporting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending Report...
                  </>
                ) : isReported ? (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Report Sent
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {useAppStore.getState().telemetryMode === 'auto' ? 'Report Issue' : 'Confirm & Send Report'}
                  </>
                )}
              </button>

              {!isReported && useAppStore.getState().telemetryMode !== 'auto' && (
                <button 
                  onClick={this.toggleReview}
                  className="flex w-full items-center justify-center rounded-md border border-gray-700 bg-transparent px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {showReview ? 'Hide Scrubbed Data' : 'Review Scrubbed Data'}
                </button>
              )}
              
              <button 
                onClick={this.handleReload} 
                className="flex w-full items-center justify-center rounded-md border border-gray-700 bg-transparent px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
