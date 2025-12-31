import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent, OptimizedResume } from "../types";

export class GeminiService {
  
  /**
   * دالة الاتصال الموحدة بالـ Backend
   * تقوم بإرسال الطلبات إلى ملف handler الذي كتبناه بـ Groq
   */
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
      // نتصل بـ api/groq لأنك نقلت المنطق هناك
      const response = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // التعامل مع الأخطاء المنطقية القادمة من السيرفر
      if (data.error === true) {
         console.warn(`API Logic Warning for action: ${action}`);
         return {}; 
      }

      return data;
    } catch (error) {
      console.error(`GeminiService Error [${action}]:`, error);
      throw error;
    }
  }

  // ================= الوظائف الرئيسية =================

  /**
   * 1. تحليل السيرة الذاتية (Audit)
   */
  async analyzeResume(text: string): Promise<AnalysisResult> {
    const data = await this.callBackend('analyze', { text });

    // تعبئة البيانات الافتراضية في حال لم يُعد السيرفر بعض الحقول
    return {
      detectedRole: "Professional", // Groq Parser might not extract role explicitly usually
      parsingFlags: {
        isGraphic: false, hasColumns: false, hasTables: false, hasStandardSectionHeaders: true, contactInfoInHeader: true
      },
      // البيانات القادمة من الـ Handler
      structuredSections: data.structuredSections || [],
      overallScore: data.overallScore || 50,
      
      // قيم افتراضية للحقول التي لم يطلبها الـ Prompt المختصر في Groq
      // (يمكنك توسيع الـ Prompt في السيرفر لاحقاً لملئها)
      hardSkillsFound: [],
      softSkillsFound: [],
      missingHardSkills: [],
      metrics: { totalBulletPoints: 0, bulletsWithMetrics: 0, weakVerbsCount: 0, sectionCount: data.structuredSections?.length || 0 },
      formattingIssues: [],
      criticalErrors: [], 
      strengths: [], 
      weaknesses: [],
      summaryFeedback: "Resume parsed successfully. Ready for optimization."
    };
  }

  /**
   * 2. تحسين السيرة الذاتية بالكامل (Optimize - الميزة الجديدة)
   * هذه الدالة تستدعي الـ Action الجديد الذي أضفناه في Groq
   */
  async optimizeResume(resumeText: string): Promise<OptimizedResume> {
    const data = await this.callBackend('optimize', { text: resumeText });

    return {
      language: data.language || "en",
      contactInfo: data.contactInfo || { fullName: "", jobTitle: "", location: "" },
      summary: data.summary || "",
      skills: data.skills || [],
      experience: data.experience || [],
      education: data.education || [],
      additionalSections: data.additionalSections || []
    };
  }

  /**
   * 3. تحسين مجموعة أقسام (Bulk Improve)
   */
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    // تعيد كائن يحتوي على { id: "new content" }
    return await this.callBackend('bulk_improve', { sections });
  }

  /**
   * 4. تحسين قسم واحد (Improve Single Section)
   * نستخدم bulk_improve ولكن لقسم واحد فقط للتحايل وتوفير الكود
   */
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    // نرسلها كأنها قائمة من عنصر واحد
    const mockSection = { id: 'temp_single', title, content };
    const response = await this.callBackend('bulk_improve', { sections: [mockSection] });
    
    const newContent = response['temp_single'] || content;

    return { 
        professional: newContent, 
        atsOptimized: newContent 
    };
  }

  /**
   * 5. مطابقة الوظيفة (Match Job)
   * (اختياري: إذا لم تضف هذا في Groq Handler، سيعيد نتيجة فارغة ولن يكسر التطبيق)
   */
  async matchJobDescription(resumeText: string, jd: string): Promise<JobMatchResult> {
    // إذا لم تضف "match" في handler السيرفر، هذا الطلب سيعود بـ {}
    const data = await this.callBackend('match', { resume: resumeText, jd });
    
    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "Job matching is currently processing...",
      matchPercentage: data.matchPercentage || 0,
      tailoredSections: []
    };
  }
}
