import React from 'react';
import { AnalysisResult } from '../types';
import { ScoreGauge } from './ScoreGauge';
import { 
  ShieldAlert, 
  Binary, 
  Target, 
  Activity, 
  AlertOctagon, 
  CheckCircle2, 
  Edit3, 
  FileSearch,
  Zap,
  ShieldCheck,
  TrendingUp,
  Award,
  FilePlus2
} from 'lucide-react';

interface DashboardProps {
  result: AnalysisResult;
  onEdit: () => void;
  onOpenMatch: () => void;
  onNewScan: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ result, onEdit, onOpenMatch, onNewScan }) => {
  // حماية إضافية للبيانات المستلمة
  const metrics = result?.metrics || { totalBulletPoints: 0, bulletsWithMetrics: 0, weakVerbsCount: 0, sectionCount: 0 };
  
  const metricRatio = (metrics?.totalBulletPoints || 0) > 0 
    ? ((metrics?.bulletsWithMetrics || 0) / (metrics?.totalBulletPoints || 1)) * 100 
    : 0;

  const score = result?.overallScore || 0;
  const isCritical = score < 35;
  const isExcellent = score >= 75;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Forensic Verdict Header */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="md:col-span-1 bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-indigo-500/30 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors" />
          <ScoreGauge score={score} label="ATS Compliance Index" size={180} />
          <div className="mt-6 text-center z-10">
            <div className="flex items-center gap-1 justify-center text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] mb-1">
              <ShieldCheck size={12} /> Forensic V4.5 Balanced
            </div>
            <div className={`text-sm font-bold ${isCritical ? 'text-rose-400' : isExcellent ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isCritical ? 'فحص دقيق: يحتاج تحسين' : isExcellent ? 'جاهزية تامة للتوظيف' : 'نتيجة تنافسية'}
            </div>
          </div>
        </div>
        
        <div className="md:col-span-3 bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
                <Binary size={14} /> PROPHET V4.5 - BALANCED AUDIT LOGIC
              </div>
              <button 
                onClick={onNewScan}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-800 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all border border-slate-200 shadow-sm active:scale-95 group"
              >
                <FilePlus2 size={16} className="group-hover:rotate-12 transition-transform" /> Scan New File
              </button>
            </div>
            <h2 className="text-2xl font-black text-slate-800 leading-tight mb-4 italic">
              "{result?.summaryFeedback || "لم يتم توفير ملخص للتحليل."}"
            </h2>
            <div className="flex flex-wrap gap-4 mt-8">
              <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">الدور الوظيفي المكتشف</p>
                <p className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Target size={18} className="text-indigo-500" /> {result?.detectedRole || "غير محدد"}
                </p>
              </div>
              <div className="bg-indigo-50 px-6 py-4 rounded-2xl border border-indigo-100">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">كثافة الإنجازات</p>
                <p className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-indigo-500" /> {Math.round(metricRatio)}%
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 mt-10">
            <button 
              onClick={onEdit}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <Edit3 size={18} /> تحسين محتوى الأقسام
            </button>
            <button 
              onClick={onOpenMatch}
              className="flex-1 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-[1.5rem] font-black hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-[0.98]"
            >
              مطابقة مع وصف وظيفة
            </button>
          </div>
        </div>
      </div>

      {/* Logic Explained - Balanced Version */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-[2rem] p-8">
        <div className="flex items-center gap-3 mb-6">
          <Award className="text-indigo-600" size={20} />
          <h3 className="text-lg font-black text-slate-800">كيف يتم احتساب درجتك؟ (النظام العالمي المتوازن)</h3>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 uppercase">1. هيكل السيرة (25%)</p>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '100%' }}></div>
            </div>
            <p className="text-[10px] text-slate-400">تحصل على نقاط فورية عند وجود الأقسام الأساسية.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 uppercase">2. المهارات (30%)</p>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '80%' }}></div>
            </div>
            <p className="text-[10px] text-slate-400">نقاط تراكمية بناءً على تنوع الكلمات المفتاحية التقنية.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 uppercase">3. لغة الأرقام (30%)</p>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '60%' }}></div>
            </div>
            <p className="text-[10px] text-slate-400">أقوى معيار؛ هل وصفت إنجازاتك بأرقام ونسب مئوية؟</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 uppercase">4. التنسيق الفني (15%)</p>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: '90%' }}></div>
            </div>
            <p className="text-[10px] text-slate-400">درجة خلو الملف من الأخطاء التي تعيق القارئ الآلي.</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Keywords */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <FileSearch size={16} /> المهارات المستخرجة
          </h3>
          <div className="space-y-6 flex-1">
            <div>
              <p className="text-[10px] font-black text-emerald-500 uppercase mb-3 tracking-tighter">موجود في سيرتك</p>
              <div className="flex flex-wrap gap-1.5">
                {(result?.hardSkillsFound || []).slice(0, 12).map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100">{s}</span>
                ))}
              </div>
            </div>
            <div className="pt-6 border-t border-slate-50">
              <p className="text-[10px] font-black text-indigo-500 uppercase mb-3 tracking-tighter">ننصح بإضافتها (لزيادة الدرجة)</p>
              <div className="flex flex-wrap gap-1.5">
                {(result?.missingHardSkills || []).map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity size={16} /> التدقيق الرقمي
          </h3>
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="relative mb-6">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="58" className="stroke-slate-100 fill-none" strokeWidth="8" />
                <circle 
                  cx="64" cy="64" r="58" 
                  className={`fill-none transition-all duration-1000 ${metricRatio < 30 ? 'stroke-amber-400' : 'stroke-indigo-500'}`}
                  strokeWidth="8" 
                  strokeDasharray={364.42} 
                  strokeDashoffset={364.42 - (364.42 * metricRatio) / 100} 
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black ${metricRatio < 30 ? 'text-amber-600' : 'text-slate-800'}`}>{Math.round(metricRatio)}%</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Impact Score</span>
              </div>
            </div>
            <div className="w-full space-y-3">
              <MetricItem label="نقاط الوصف" value={metrics?.totalBulletPoints || 0} />
              <MetricItem label="جمل قوية (بأرقام)" value={metrics?.bulletsWithMetrics || 0} color="text-emerald-600" />
              <MetricItem label="أفعال ضعيفة" value={metrics?.weakVerbsCount || 0} color="text-rose-600" />
            </div>
          </div>
        </div>

        {/* Compliance */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <ShieldAlert size={16} /> معوقات الـ ATS
          </h3>
          <div className="space-y-4 flex-1">
            {(result?.criticalErrors?.length > 0 || result?.formattingIssues?.length > 0) ? (
              <>
                {(result.criticalErrors || []).map((err, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                    <AlertOctagon className="text-rose-600 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs font-bold text-rose-900 leading-snug">{err}</p>
                  </div>
                ))}
                {(result.formattingIssues || []).map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <Zap className="text-amber-600 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs font-bold text-amber-900 leading-snug">{issue}</p>
                  </div>
                ))}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <p className="text-sm font-black text-slate-800 mb-1">تنسيق مثالي!</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">سيرتك قابلة للقراءة تماماً من كافة الأنظمة.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricItem = ({ label, value, color = "text-slate-800" }: { label: string, value: number, color?: string }) => (
  <div className="flex justify-between items-center px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{label}</span>
    <span className={`text-sm font-black ${color}`}>{value}</span>
  </div>
);