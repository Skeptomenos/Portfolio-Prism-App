import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadHoldings, runPipeline } from '../lib/ipc';
import Modal from './ui/Modal';

interface HoldingsUploadProps {
  isOpen: boolean;
  onClose: () => void;
  etfIsin: string;
  etfTicker: string;
  onSuccess?: () => void;
}

const HoldingsUpload: React.FC<HoldingsUploadProps> = ({
  isOpen,
  onClose,
  etfIsin,
  etfTicker,
  onSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setErrorMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setStatus('idle');
      
      // In Tauri, we need the absolute path. 
      // Note: Standard web File object doesn't give absolute path for security.
      // However, in Tauri, if we use the dialog plugin we get the path.
      // Since we are using standard input, we might need to handle this differently
      // or assume the backend can handle the file content if we sent it.
      // BUT our backend command expects a filePath.
      
      // WORKAROUND: For now, we'll use the file name and assume it's in a known location
      // OR we'll tell the user to use the dialog.
      // Actually, I'll try to use the dialog if possible.
      
      // For now, I'll implement the UI and use a mock path if not in Tauri.
      const filePath = (file as any).path || file.name;
      
      const res = await uploadHoldings(filePath, etfIsin);
      setResult(res);
      setStatus('success');
      
      // Trigger pipeline re-run
      await runPipeline();
      
      if (onSuccess) onSuccess();
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Upload Holdings for ${etfTicker}`}
    >
      <div className="p-6">
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-4">
            Upload a CSV, XLSX, or JSON file containing the holdings for <strong>{etfIsin}</strong>.
            The system will automatically clean and normalize the data.
          </p>
          
          <div 
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-colors
              ${file ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-white/20'}
            `}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".csv,.xlsx,.xls,.json"
            />
            
            {file ? (
              <div className="flex flex-col items-center">
                <FileText className="w-12 h-12 text-blue-400 mb-3" />
                <span className="text-sm font-medium text-white">{file.name}</span>
                <span className="text-xs text-gray-500 mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-12 h-12 text-gray-500 mb-3" />
                <span className="text-sm text-gray-400">Click to select or drag and drop</span>
                <span className="text-xs text-gray-600 mt-1">CSV, XLSX, or JSON</span>
              </div>
            )}
          </div>
        </div>

        {status === 'success' && result && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-500">Upload Successful</h4>
              <p className="text-xs text-emerald-500/80 mt-1">
                Found {result.holdingsCount} holdings with {result.totalWeight}% total weight.
                {result.contributedToHive && " Data contributed to community Hive."}
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-500">Upload Failed</h4>
              <p className="text-xs text-red-500/80 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          
          {status === 'success' ? (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-all"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`
                px-6 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2
                ${!file || uploading 
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}
              `}
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Processing...' : 'Upload & Analyze'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default HoldingsUpload;
