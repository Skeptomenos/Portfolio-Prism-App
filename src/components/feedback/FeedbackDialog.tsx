import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sendFeedback, FeedbackType } from '@/lib/api/feedback';
import { useCurrentView, useAppStore } from '@/store/useAppStore';
import { isTauri } from '@/lib/tauri';
import { 
  Bug, 
  Lightbulb, 
  Sparkles, 
  X, 
  Send, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose }) => {
  const [type, setType] = useState<FeedbackType>('functional');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentView = useCurrentView();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setError(null);
    
    try {
      const appState = useAppStore.getState();
      const result = await sendFeedback({
        type,
        message,
        metadata: {
          source: 'user_dialog',
          view: currentView,
          environment: isTauri() ? 'tauri' : 'browser',
          lastSync: appState.lastSyncTime?.toISOString(),
        }
      });
      setIsSuccess(true);
      setIssueUrl(result.issue_url);
      // Don't auto-close - let user see the success and click the link
    } catch (err) {
      console.error('Failed to send feedback:', err);
      setError(err instanceof Error ? err.message : 'Failed to send feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleClose = () => {
    setIsSuccess(false);
    setIssueUrl(null);
    setError(null);
    setMessage('');
    setType('functional');
    onClose();
  };

  const options = [
    { 
      id: 'functional' as const, 
      label: 'Bug Report', 
      icon: Bug, 
      color: 'text-rose-400',
      activeClass: 'border-rose-500/50 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
    },
    { 
      id: 'feature' as const, 
      label: 'Feature Idea', 
      icon: Lightbulb, 
      color: 'text-amber-400',
      activeClass: 'border-amber-500/50 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.1)]'
    },
    { 
      id: 'ui_ux' as const, 
      label: 'UI / UX', 
      icon: Sparkles, 
      color: 'text-violet-400',
      activeClass: 'border-violet-500/50 bg-violet-500/10 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.1)]'
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 className="text-lg font-semibold text-zinc-100">Send Feedback</h2>
              <button
                onClick={handleClose}
                className="rounded-full p-1 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {isSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-8 text-center"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-emerald-400">Feedback Sent!</h3>
                  <p className="text-zinc-400 mb-4">Thank you for helping us improve Portfolio Prism.</p>
                  {issueUrl && !issueUrl.includes('mock') && (
                    <a
                      href={issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View on GitHub
                    </a>
                  )}
                  <button
                    onClick={handleClose}
                    className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                  >
                    Close
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3"
                    >
                      <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-rose-300">{error}</p>
                      </div>
                    </motion.div>
                  )}
                  
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      What kind of feedback?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {options.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = type === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setType(opt.id)}
                            className={`group flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-all duration-200
                              ${isSelected 
                                ? opt.activeClass 
                                : 'border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:border-white/10'
                              }`}
                          >
                            <Icon className={`h-6 w-6 ${isSelected ? 'scale-110' : 'group-hover:scale-110'} transition-transform`} />
                            <span className="text-xs font-medium">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Details
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what happened or what you'd like to see..."
                      className="min-h-[140px] w-full resize-none rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !message.trim()}
                      className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send Feedback
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
