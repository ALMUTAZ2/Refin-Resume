import React, { useState, useEffect, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { JobMatchModal } from './components/JobMatchModal';
import { AppStep, AnalysisResult, ResumeSection } from './types';
import { GeminiService } from './services/geminiService';
import { DocumentService } from './services/documentService';
import { Cpu, Sparkles, ShieldCheck, RefreshCcw, AlertTriangle } from 'lucide-react';

const STORAGE_KEYS = {
  STEP: 'ats_app_step',
  RESUME_TEXT: 'ats_resume_text',
  ANALYSIS: 'ats_analysis',
  SECTIONS: 'ats_sections',
  HISTORY: 'ats_history'
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(() => (localStorage.getItem(STORAGE_KEYS.STEP) as AppStep) || AppStep.UPLOAD);
  const [resumeText, setResumeText] = useState(() => localStorage.getItem(STORAGE_KEYS.RESUME_TEXT) || '');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ANALYSIS);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [sections, setSections] = useState<ResumeSection[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SECTIONS);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [loading, setLoading] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STEP, step);
    localStorage.setItem(STORAGE_KEYS.RESUME_TEXT, resumeText);
    if (analysis) localStorage.setItem(STORAGE_KEYS.ANALYSIS, JSON.stringify(analysis));
    if (sections.length > 0) localStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(sections));
  }, [step, resumeText, analysis, sections]);

  const handleReset = useCallback(() => {
    if (window.confirm("العودة لشاشة الرفع للبدء بفحص جديد؟")) {
      setStep(AppStep.UPLOAD);
      setAnalysis(null);
      setSections([]);
      setResumeText('');
      setErrorMessage(null);
      localStorage.removeItem(STORAGE_KEYS.STEP);
      localStorage.removeItem(STORAGE_KEYS.ANALYSIS);
      localStorage.removeItem(STORAGE_KEYS.SECTIONS);
      localStorage.removeItem(STORAGE_KEYS.RESUME_TEXT);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const text = await DocumentService.extractText(file);
      if (!text || text.length < 50) throw new Error("تعذر استخراج نص كافٍ من الملف.");
      
      setResumeText(text);
      const gemini = new GeminiService();
      const result = await gemini.analyzeResume(text);
      
      setAnalysis(result);
      setSections(result.structuredSections);
      setStep(AppStep.DASHBOARD);
    } catch (err: any) { 
      setErrorMessage(err.message || "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans selection:bg-indigo-100">
      <nav className="border-b bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => step !== AppStep.UPLOAD && handleReset()}>
            <ShieldCheck className="text-indigo-600" size={32} />
            <span className="text-xl font-black tracking-tight text-slate-900 uppercase">Prophet<span className="text-indigo-600">V4.5</span></span>
          </div>
          
          <div className="flex gap-4 items-center">
             {step !== AppStep.UPLOAD && (
               <button onClick={handleReset} className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-95 border border-transparent hover:border-rose-100">
                 <RefreshCcw size={16} /> Scan New
               </button>
             )}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-6 w-full py-10">
        {errorMessage && (
          <div className="mb-8 p-6 bg-rose-50 border-2 border-rose-100 rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top-4 duration-300">
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="font-black text-rose-900">حدث خطأ في النظام</h3>
              <p className="text-sm text-rose-700 font-medium">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="mr-auto text-rose-400 hover:text-rose-600 font-bold">إغلاق</button>
          </div>
        )}

        {loading ? (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-slate-100 rounded-full animate-pulse"></div>
              <div className="w-24 h-24 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              <Cpu className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={32} />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">تحليل مكثف للبيانات...</h2>
            <p className="text-slate-500 max-w-sm mx-auto leading-relaxed font-mono text-xs opacity-60 uppercase tracking-widest">Scanning with Prophet Engine</p>
          </div>
        ) : (
          <>
            {step === AppStep.UPLOAD && (
              <div className="space-y-12 animate-in fade-in zoom-in-95 duration-700">
                <div className="text-center max-w-2xl mx-auto pt-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase mb-6 border border-indigo-100 tracking-widest">
                    <Sparkles size={12} /> Forensic Intelligence Active
                  </div>
                  <h1 className="text-6xl font-black text-slate-900 mb-6 leading-[1.1] tracking-tight">تخطَّ حواجز الـ <span className="text-indigo-600">Bots</span></h1>
                  <p className="text-xl text-slate-500 leading-relaxed font-medium">نظام PROPHET يفكك سيرتك الذاتية ويعيد صياغتها لتجتاز أنظمة الفرز (ATS) بأعلى الدرجات.</p>
                </div>
                <FileUploader onUpload={handleUpload} />
              </div>
            )}
            {step === AppStep.DASHBOARD && analysis && (
              <Dashboard result={analysis} onEdit={() => setStep(AppStep.EDITOR)} onOpenMatch={() => setShowMatchModal(true)} onNewScan={handleReset} />
            )}
            {step === AppStep.EDITOR && (
              <Editor sections={sections} onBack={() => setStep(AppStep.DASHBOARD)} />
            )}
          </>
        )}
      </main>
      {showMatchModal && (
        <JobMatchModal 
          resumeText={resumeText} 
          sections={sections} 
          onClose={() => setShowMatchModal(false)} 
          onApplyTailoring={(t) => { setSections(t); setStep(AppStep.EDITOR); }} 
        />
      )}
    </div>
  );
};

export default App;
