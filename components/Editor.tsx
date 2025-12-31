import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ResumeSection, ImprovedContent, OptimizedResume } from '../types';
import { Edit3, Sparkles, Download, ArrowLeft, Loader2, RefreshCw, FileText, FileDown, Bold, List, Wand2, AlertTriangle } from 'lucide-react';
import { ExportService } from '../services/exportService';
import { GeminiService } from '../services/geminiService';

// --- Helper Functions ---
const mapOptimizedToSections = (data: OptimizedResume): ResumeSection[] => {
  const sections: ResumeSection[] = [];
  
  // 1. Header & Contact
  const contactContent = `
    <div style="text-align:center">
      <h1>${data.contactInfo.fullName}</h1>
      <h3>${data.contactInfo.jobTitle}</h3>
      <p>${[data.contactInfo.location, data.contactInfo.email || '', data.contactInfo.phone || ''].filter(Boolean).join(' | ')}</p>
    </div>
  `;
  sections.push({ id: 'header', title: 'Header', content: contactContent });

  // 2. Summary
  if (data.summary) {
    sections.push({ id: 'summary', title: 'Professional Summary', content: `<p>${data.summary}</p>` });
  }

  // 3. Skills
  if (data.skills?.length > 0) {
    const skillsHtml = `<p><strong>Core Competencies:</strong> ${data.skills.join(' • ')}</p>`;
    sections.push({ id: 'skills', title: 'Skills', content: skillsHtml });
  }

  // 4. Experience
  if (data.experience?.length > 0) {
    let expHtml = '';
    data.experience.forEach(job => {
      expHtml += `
        <div style="margin-bottom: 15px;">
          <div style="display:flex; justify-content:space-between;">
            <strong>${job.company}</strong>
            <em>${job.period}</em>
          </div>
          <div><strong>${job.role}</strong></div>
          <ul>${job.achievements.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>
      `;
    });
    sections.push({ id: 'experience', title: 'Work Experience', content: expHtml });
  }

  // 5. Education
  if (data.education?.length > 0) {
    let eduHtml = '';
    data.education.forEach(edu => {
      eduHtml += `
        <div style="display:flex; justify-content:space-between;">
          <div><strong>${edu.degree}</strong>, ${edu.school}</div>
          <em>${edu.year}</em>
        </div>
      `;
    });
    sections.push({ id: 'education', title: 'Education', content: eduHtml });
  }

  // 6. Additional Sections (Languages, etc.)
  if (data.additionalSections?.length > 0) {
    data.additionalSections.forEach((sec, idx) => {
      const contentHtml = `<ul>${sec.content.map(c => `<li>${c}</li>`).join('')}</ul>`;
      sections.push({ id: `add_${idx}`, title: sec.title, content: contentHtml });
    });
  }

  return sections;
};

const Zap = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const MiniRichEditor: React.FC<{ 
  value: string; 
  onChange: (val: string) => void; 
  readOnly?: boolean; 
  className?: string;
}> = ({ value, onChange, readOnly, className }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isTyping = useRef(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value && !isTyping.current) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      isTyping.current = true;
      onChange(editorRef.current.innerHTML);
      setTimeout(() => { isTyping.current = false; }, 10);
    }
  };

  const execCommand = (cmd: string) => {
    document.execCommand(cmd, false);
    handleInput();
  };

  return (
    <div className="flex flex-col gap-2">
      {!readOnly && (
        <div className="flex gap-2 mb-2 p-2 bg-slate-50 border border-slate-200 rounded-xl self-start sticky top-0 z-20">
          <button type="button" onClick={() => execCommand('bold')} className="p-2 hover:bg-white rounded-lg text-slate-600 border border-transparent hover:border-slate-200 transition-all"><Bold size={16} /></button>
          <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-2 hover:bg-white rounded-lg text-slate-600 border border-transparent hover:border-slate-200 transition-all"><List size={16} /></button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        onInput={handleInput}
        className={`${className} focus:ring-0 outline-none font-serif leading-relaxed text-lg min-h-[200px] transition-all p-8 rounded-[2rem] bg-white border-2 border-slate-50 ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-text focus:border-indigo-100 shadow-inner'}`}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  );
};

interface EditorProps {
  sections: ResumeSection[];
  resumeText: string; // ✅ Added Prop
  onBack: () => void;
}

export const Editor: React.FC<EditorProps> = ({ sections, resumeText, onBack }) => {
  const [currentSections, setCurrentSections] = useState<ResumeSection[]>(sections);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [optimizeCount, setOptimizeCount] = useState(() => {
    const saved = localStorage.getItem('optimize_count');
    return saved ? parseInt(saved) : 0;
  });
  const [activeSuggestions, setActiveSuggestions] = useState<Record<string, ImprovedContent | null>>({});
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    // Only set initial sections if we haven't modified them yet
    if (currentSections.length === 0) setCurrentSections(sections);
  }, [sections]);

  useEffect(() => {
    localStorage.setItem('optimize_count', optimizeCount.toString());
  }, [optimizeCount]);

  const handleUpdate = useCallback((id: string, newContent: string) => {
    setCurrentSections(prev => prev.map(s => s.id === id ? { ...s, content: newContent } : s));
  }, []);

  // ✅ New Logic: Use optimizeResume instead of bulkImprove
  const handleImproveAllATS = async () => {
    if (globalLoading) return;

    if (optimizeCount >= 2) {
      alert("⚠️ لقد استهلكت جميع محاولات التحسين الشامل لهذا الملف.");
      return;
    }

    if (window.confirm(`جاري الآن إعادة كتابة السيرة الذاتية بالكامل (Full Rewrite). هل أنت متأكد؟`)) {
      setGlobalLoading(true);
      try {
        const gemini = new GeminiService();
        // Call the new powerful endpoint
        const optimizedData = await gemini.optimizeResume(resumeText);
        
        // Convert the result back to sections for the editor
        const newSections = mapOptimizedToSections(optimizedData);
        
        setCurrentSections(newSections);
        setOptimizeCount(prev => prev + 1);
        alert("✅ تم إعادة بناء السيرة الذاتية بنجاح!");
      } catch (err: any) {
        console.error(err);
        alert("حدث خطأ أثناء الاتصال بالخادم.");
      } finally {
        setGlobalLoading(false);
      }
    }
  };

  const handleImproveRequest = async (section: ResumeSection) => {
    if (loadingStates[section.id]) return;
    setLoadingStates(prev => ({ ...prev, [section.id]: true }));
    try {
      const gemini = new GeminiService();
      const result = await gemini.improveSection(section.title, section.content);
      setActiveSuggestions(prev => ({ ...prev, [section.id]: result }));
    } catch (err) {
      alert('فشل الاتصال بالذكاء الاصطناعي.');
    } finally {
      setLoadingStates(prev => ({ ...prev, [section.id]: false }));
    }
  };

  const applyChoice = (sectionId: string, type: 'professional' | 'atsOptimized') => {
    const sugg = activeSuggestions[sectionId];
    if (sugg) {
      handleUpdate(sectionId, sugg[type]);
      setActiveSuggestions(prev => ({ ...prev, [sectionId]: null }));
    }
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    if (format === 'pdf') await ExportService.generatePdf(currentSections);
    else if (format === 'txt') ExportService.generateTxt(currentSections);
    else await ExportService.generateDocx(currentSections);
    setShowExportMenu(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-40 animate-in fade-in slide-in-from-bottom-5 duration-500">
      <div className="flex items-center justify-between bg-white/90 backdrop-blur-md p-6 rounded-3xl shadow-2xl border sticky top-24 z-40">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-all px-4 py-2 hover:bg-slate-50 rounded-xl">
          <ArrowLeft size={18} /> العودة للوحة التحكم
        </button>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-black hover:bg-indigo-600 shadow-xl transition-all flex items-center gap-3 active:scale-95">
              <Download size={20} /> تصدير النتائج
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border p-2 z-50 animate-in fade-in zoom-in-95">
                <button onClick={() => handleExport('pdf')} className="w-full flex items-center gap-3 p-4 hover:bg-red-50 rounded-2xl transition-colors text-left group">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600"><FileDown size={20} /></div>
                  <div><div className="text-sm font-black text-slate-800">Adobe PDF</div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">تحميل ملف PDF</div></div>
                </button>
                <button onClick={() => handleExport('docx')} className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 rounded-2xl transition-colors text-left group">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600"><FileText size={20} /></div>
                  <div><div className="text-sm font-black text-slate-800">Word Document</div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">تحميل ملف Word</div></div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Optimization Banner */}
      <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-[100px] pointer-events-none"></div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
            <Wand2 size={32} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight">ATS Smart Refine (Full Rewrite)</h3>
            <p className="text-slate-400 text-sm font-medium">إعادة صياغة كاملة للسيرة الذاتية (بما فيها اللغات والدورات).</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-300">
              <AlertTriangle size={12} className="text-amber-400" /> متبقي لك: {2 - optimizeCount} استخدام
            </div>
          </div>
        </div>
        <div className="flex gap-4 relative z-10">
          <button 
            disabled={globalLoading || optimizeCount >= 2}
            onClick={handleImproveAllATS}
            className={`px-10 py-5 rounded-2xl font-black text-lg transition-all shadow-2xl flex items-center gap-3 active:scale-95 ${optimizeCount >= 2 ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/40'}`}
          >
            {globalLoading ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} className="fill-current" />} 
            {optimizeCount >= 2 ? 'انتهت المحاولات' : 'Full Optimization'}
          </button>
        </div>
      </div>

      <div className="space-y-16">
        {currentSections.map((section) => {
          const suggestion = activeSuggestions[section.id];
          const isLoading = loadingStates[section.id];

          return (
            <div key={section.id} className="relative group">
              <div className="absolute -top-6 left-10 z-10 flex items-center gap-3">
                <div className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl border border-slate-700">
                  {section.title}
                </div>
                {isLoading && <div className="bg-indigo-600 text-white px-4 py-2 rounded-2xl text-[10px] font-bold animate-bounce shadow-lg">جاري التحسين...</div>}
              </div>

              <div className={`bg-white rounded-[3rem] shadow-sm border-2 transition-all duration-500 ${suggestion ? 'border-indigo-500 ring-[12px] ring-indigo-50' : 'border-slate-50 group-hover:border-slate-200'}`}>
                <div className="p-12 pt-14">
                  <div className="flex justify-end gap-3 mb-8">
                    <button 
                      onClick={() => handleImproveRequest(section)}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-8 py-3 bg-indigo-50 text-indigo-700 rounded-2xl text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={16} className="animate-spin" /> : <><Sparkles size={16} /> تحسين ذكي (قسم فقط)</>}
                    </button>
                  </div>

                  {suggestion ? (
                    <div className="space-y-8 animate-in zoom-in-95 duration-500">
                      <div className="grid md:grid-cols-2 gap-8">
                        <div onClick={() => applyChoice(section.id, 'professional')} className="group/card flex flex-col p-8 rounded-[2.5rem] border-2 border-slate-100 bg-slate-50/50 hover:bg-white hover:border-indigo-500 hover:shadow-2xl transition-all cursor-pointer relative">
                          <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-xl self-start mb-6">الخيار الاحترافي</span>
                          <div className="text-lg text-slate-700 leading-relaxed font-serif prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: suggestion.professional }} />
                        </div>
                        <div onClick={() => applyChoice(section.id, 'atsOptimized')} className="group/card flex flex-col p-8 rounded-[2.5rem] border-2 border-slate-100 bg-emerald-50/30 hover:bg-white hover:border-emerald-500 hover:shadow-2xl transition-all cursor-pointer relative">
                          <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-xl self-start mb-6">تحسين الـ ATS</span>
                          <div className="text-lg text-slate-700 leading-relaxed font-serif prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: suggestion.atsOptimized }} />
                        </div>
                      </div>
                      <button onClick={() => setActiveSuggestions(prev => ({ ...prev, [section.id]: null }))} className="text-xs font-bold text-slate-400 hover:text-rose-500 mx-auto block py-2 px-6 rounded-full hover:bg-rose-50 transition-all">إلغاء الاقتراحات</button>
                    </div>
                  ) : (
                    <MiniRichEditor
                      value={section.content}
                      onChange={(newVal) => handleUpdate(section.id, newVal)}
                      className="text-slate-800"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
