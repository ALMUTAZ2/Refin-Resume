
import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploaderProps {
  onUpload: (file: File) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx' && ext !== 'doc') {
      setError('Please upload only PDF or Word documents.');
      return;
    }

    setError(null);
    setProgress(10);
    
    // Simulate parsing progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          onUpload(file);
          return 100;
        }
        return prev + 20;
      });
    }, 200);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-12 transition-all duration-200 text-center
          ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 bg-white shadow-sm'}
          ${progress > 0 && progress < 100 ? 'pointer-events-none' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.doc,.docx"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            {progress === 100 ? (
              <CheckCircle className="w-8 h-8 text-indigo-600" />
            ) : (
              <Upload className="w-8 h-8 text-indigo-600" />
            )}
          </div>
          
          <h3 className="text-xl font-semibold mb-2">
            {progress > 0 && progress < 100 ? 'Parsing document...' : 'Upload your resume'}
          </h3>
          <p className="text-slate-500 mb-8 max-w-xs mx-auto text-sm">
            Drag and drop your PDF or Word document here, or click to browse.
          </p>

          {progress > 0 && progress < 100 && (
            <div className="w-full bg-slate-100 rounded-full h-2 max-w-sm mb-4">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1"><FileText size={14} /> PDF</span>
            <span className="flex items-center gap-1"><FileText size={14} /> DOCX</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 justify-center text-red-500 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
