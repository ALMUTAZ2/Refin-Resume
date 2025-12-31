import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent, OptimizedResume } from "../types";

export class GeminiService {
  
  /**
   * دالة مركزية للاتصال بالـ Backend (Groq API)
   */
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
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
      
      if (data.error === true) {
         console.warn(`API returned logic warning for action: ${action}`);
         return {}; 
      }

      return data;
    } catch (error) {
      console.error(`GeminiService Error [${action}]:`, error);
      throw error;
    }
  }

  // ================= الوظائف =================

  /**
   * تحليل السيرة الذاتية
   */
  async analyzeResume(text: string): Promise<AnalysisResult> {
    const data = await this.callBackend('analyze', { text });

    return {
      detectedRole: data.extractedHeadlines?.[0] || "Professional",
      parsingFlags: data.parsingFlags || {
        isGraphic: false, hasColumns: false, hasTables: false, hasStandardSectionHeaders: true, contactInfoInHeader: true
      },
      hardSkillsFound: data.hardSkillsFound || [],
      softSkillsFound: data.softSkillsFound || [],
      missingHardSkills: [],
      metrics: data.metrics || { 
        totalBulletPoints: 0, 
        bulletsWithMetrics: 0, 
        weakVerbsCount: 0, 
        sectionCount: data.structuredSections?.length || 0 
      },
      formattingIssues: data.formattingIssues || [],
      criticalErrors: [],
      strengths: [],
      weaknesses: [],
      summaryFeedback: data.summaryFeedback || "Ready for optimization.",
      structuredSections: data.structuredSections || [],
      overallScore: data.overallScore || 50
    };
  }

  /**
   * ✅ الميزة الجديدة: تحسين السيرة الذاتية بالكامل
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
   * تحسين مجموعة من الأقسام
   */
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    return await this.callBackend('bulk_improve', { sections });
  }

  /**
   * تحسين قسم واحد
   */
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const mockSection = { id: 'temp_single', title, content };
    // نستخدم bulk_improve للتحايل وتوفير الكود
    const response = await this.callBackend('bulk_improve', { sections: [mockSection] });
    
    const newContent = response['temp_single'] || content;

    return { 
        professional: newContent, 
        atsOptimized: newContent 
    };
  }

  /**
   * مطابقة الوظيفة
   * ✅ تم التعديل: تقبل الآن 3 مدخلات لحل مشكلة الخطأ في JobMatchModal
   */
  async matchJobDescription(resumeText: string, sections: any[], jd: string): Promise<JobMatchResult> {
    // ملاحظة: المتغير sections موجود للتوافق مع استدعاء الدالة لكننا نرسل resumeText فقط للسيرفر
    const data = await this.callBackend('match', { resume: resumeText, jd });
    
    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "",
      matchPercentage: data.matchPercentage || 0,
      tailoredSections: []
    };
  }
}
