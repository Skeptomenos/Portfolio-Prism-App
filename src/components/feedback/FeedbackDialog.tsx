import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { sendFeedback, FeedbackType } from '@/lib/api/feedback';
import { MessageSquare, AlertTriangle, Lightbulb, CheckCircle2, Loader2, Send } from 'lucide-react';

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose }) => {
  const [type, setType] = useState<FeedbackType>('functional');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    try {
      await sendFeedback({
        type,
        message,
        metadata: {
          source: 'user_dialog'
        }
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setMessage('');
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Failed to send feedback:', error);
      alert('Failed to send feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeIcon = (t: FeedbackType) => {
    switch (t) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-400" />;
      case 'feature': return <Lightbulb className="h-4 w-4 text-yellow-400" />;
      default: return <MessageSquare className="h-4 w-4 text-blue-400" />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send Feedback">
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="h-16 w-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="text-xl font-semibold text-green-400 mb-2">Feedback Sent!</h3>
          <p className="text-gray-400">Thank you for helping us improve.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Feedback Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['functional', 'ui_ux', 'feature'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center gap-2 justify-center rounded-md border p-2 text-sm transition-all
                    ${type === t 
                      ? 'border-blue-500/50 bg-blue-500/10 text-white' 
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:bg-gray-800'
                    }`}
                >
                  {getTypeIcon(t)}
                  <span className="capitalize">{t === 'ui_ux' ? 'UI / UX' : t}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-300">Description</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? Or what would you like to see?"
              className="min-h-[120px] w-full resize-none rounded-md border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              required
            />
          </div>

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
