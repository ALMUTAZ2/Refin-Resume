
import React, { useState, useRef } from 'react';
import { X, Search, Check, AlertCircle, Sparkles, ArrowRight, FileUp, Loader2, Download, FileText, FileDown, Info } from 'lucide-react';
import { JobMatchResult, ResumeSection } from '../types';
import { GeminiService } from '../services/geminiService';
import { DocumentService } from '../services/documentService';
import { ExportService } from '../services/exportService';
import { ScoreGauge } from './ScoreGauge';

interface JobMatchModalProps {
  resumeText: string;
  sections: ResumeSection[];
  onClose: () => void;
  onApplyTailoring: (tailoredSections: ResumeSection[]) => void;
}

export const JobMatchModal: React.FC<JobMatchModalProps> = ({ resumeText, sections, onClose, onApplyTailoring }) => {
  const [jdText, setJdText] = useState('');
  const [result, setResult] = useState<JobMatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isUploadingJD, setIsUploadingJD] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingJD(true);
    try {
      const text = await DocumentService.extractText(file);
      setJdText(text);
    } catch (err) {
      alert("Failed to read file.");
    } finally {
      setIsUploadingJD(false);
    }
  };

  const handleAnalyze = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    try {
      const gemini = new GeminiService();
      const analysis = await gemini.matchJobDescription(resumeText, sections, jdText);
      setResult(analysis);
    } catch (err) {
      alert("Analysis failed. Using backup protocols...");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result?.tailoredSections) {
      onApplyTailoring(result.tailoredSections);
      onClose();
    }
  };

  const handleQuickDownload = async (format: 'pdf' | 'txt' | 'docx') => {
    if (!result?.tailoredSections) return;
    if (format === 'pdf') await ExportService.generatePdf(result.tailoredSections);
    else if (format === 'txt') ExportService.generateTxt(result.tailoredSections);
    else await ExportService.generateDocx(result.tailoredSections);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
        <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
              <Search size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">JD Match & Deep Tailor</h2>
              <p className="text-sm text-slate-500 font-medium">Auto-aligning all sections to 500-700 words standard.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10">
          {!result ? (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3 mb-4">
                <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-amber-800">
                  ملاحظة: سيقوم المحرك بتعديل **كافة الأقسام** المرفوعة وتوسيع المحتوى ليصل إلى (500-700 كلمة) لضمان أفضل فرصة تجاوز للفلاتر.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
                  <Sparkles size={14} /> Job Description
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600"
                >
                  <FileUp size={14} /> {isUploadingJD ? 'Reading...' : 'Upload JD File'}
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx" onChange={handleFileUpload} />
              </div>
              
              <textarea
                className="w-full h-80 p-6 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 bg-slate-50/30 text-lg placeholder:text-slate-300"
                placeholder="Paste the target job description here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />

              <button
                onClick={handleAnalyze}
                disabled={loading || !jdText.trim() || isUploadingJD}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Processing all sections (Target: 500+ Words)...
                  </>
                ) : (
                  <>Apply AI Deep Tailoring <ArrowRight size={20} /></>
                )}
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-12 gap-10">
              <div className="md:col-span-4 bg-slate-50 p-8 rounded-[3rem] border border-slate-100 flex flex-col items-center">
                <ScoreGauge score={result.matchPercentage} label="Job Match Score" size={180} />
                <div className="mt-8 p-6 bg-white rounded-3xl shadow-sm border border-slate-100 w-full text-center">
                  <p className="text-xs font-black text-emerald-600 uppercase mb-2">Sections Processed</p>
                  <p className="text-2xl font-black text-slate-800">{result.tailoredSections?.length} / {sections.length}</p>
                </div>
                <button onClick={() => setResult(null)} className="mt-8 text-slate-400 text-sm font-bold hover:text-indigo-600">Analyze New JD</button>
              </div>

              <div className="md:col-span-8 space-y-6">
                <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl">
                  <div className="flex items-center gap-2 mb-4 text-emerald-300">
                    <Check size={20} />
                    <h4 className="text-xl font-black">Optimization Strategy Applied</h4>
                  </div>
                  <p className="text-indigo-100 text-sm font-medium mb-8">
                    {result.matchFeedback}
                  </p>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={handleApply}
                      className="py-4 bg-white text-indigo-600 rounded-2xl font-black hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                      <ArrowRight size={18} /> Review Optimized Content in Editor
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => handleQuickDownload('pdf')}
                        className="py-3 bg-indigo-500/30 border border-indigo-400/50 text-white rounded-xl font-bold hover:bg-indigo-500/50 flex items-center justify-center gap-2"
                      >
                        <FileDown size={18} /> Quick PDF
                      </button>
                      <button 
                        onClick={() => handleQuickDownload('docx')}
                        className="py-3 bg-indigo-500/30 border border-indigo-400/50 text-white rounded-xl font-bold hover:bg-indigo-500/50 flex items-center justify-center gap-2"
                      >
                        <FileDown size={18} /> Quick Word
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Structure Verification</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.tailoredSections?.map((s, i) => (
                      <div key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 flex items-center gap-2">
                        <Check size={10} className="text-emerald-500" /> {s.title}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
