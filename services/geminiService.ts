// services/geminiService.ts
// هذا الملف آمن تماماً، لا يحتوي على أي مفاتيح سرية
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  
  // دالة الاتصال بالسيرفر الخلفي (Vercel Function)
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
      // نستدعي الـ API الذي أنشأناه في المجلد api/groq.js
      const response = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to call backend for ${action}:`, error);
      throw error;
    }
  }

  // 1. واجهة التحليل
  async analyzeResume(text: string): Promise<AnalysisResult> {
    // نرسل النص للسيرفر فقط
    const data = await this.callBackend('analyze', { text });
    
    // تنسيق البيانات القادمة من السيرفر للتأكد من توافقها مع Types
    return {
      detectedRole: data.extractedHeadlines?.[0] || "Unknown",
      parsingFlags: data.parsingFlags || {},
      hardSkillsFound: data.hardSkillsFound || [],
      softSkillsFound: data.softSkillsFound || [],
      missingHardSkills: [],
      metrics: data.metrics || {},
      formattingIssues: data.formattingIssues || [],
      criticalErrors: [],
      strengths: [],
      weaknesses: [],
      summaryFeedback: data.summaryFeedback || "Done",
      structuredSections: data.structuredSections || [],
      overallScore: data.overallScore || 50
    };
  }

  // 2. واجهة تحسين القسم
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    return await this.callBackend('improve', { title, content });
  }

  // 3. واجهة المطابقة
  async matchJobDescription(resumeText: string, sections: any[], jd: string): Promise<JobMatchResult> {
    const data = await this.callBackend('match', { resume: resumeText, jd });
    
    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "",
      matchPercentage: data.matchPercentage || 0,
      tailoredSections: []
    };
  }

  // دالة فارغة للتوافق
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    return {}; 
  }
}
 
