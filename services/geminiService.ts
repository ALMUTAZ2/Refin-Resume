
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  
  /**
   * دالة مساعدة للاتصال بالسيرفر
   * تتعامل مع الأخطاء وتعيد البيانات بصيغة JSON
   */
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
      const response = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });

      // إذا حدث خطأ في الشبكة أو السيرفر
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // التحقق من وجود خطأ منطقي مرجع من الـ API
      if (data.error === true) {
         console.warn(`API returned logic warning for action: ${action}`);
         return {}; // إرجاع كائن فارغ لتجنب توقف التطبيق
      }

      return data;
    } catch (error) {
      console.error(`GeminiService Error [${action}]:`, error);
      throw error;
    }
  }

  /**
   * تحليل السيرة الذاتية
   * السيرفر يستخدم موديل سريع لاستخراج الأقسام فقط
   */
  async analyzeResume(text: string): Promise<AnalysisResult> {
    // نرسل النص للسيرفر
    const data = await this.callBackend('analyze', { text });

    // ندمج البيانات القادمة من السيرفر مع قيم افتراضية
    // لأن الموديل السريع قد لا يعيد كل التفاصيل (مثل نقاط القوة والضعف)
    return {
      detectedRole: "Candidate", // قيمة افتراضية
      parsingFlags: {},
      hardSkillsFound: [],
      softSkillsFound: [],
      missingHardSkills: [],
      metrics: {},
      formattingIssues: [],
      criticalErrors: [],
      strengths: [],
      weaknesses: [],
      summaryFeedback: "Ready for optimization.",
      structuredSections: data.structuredSections || [], // ✅ الأهم: الأقسام المستخرجة
      overallScore: data.overallScore || 50
    };
  }

  /**
   * التحسين الشامل (Bulk Improve)
   * السيرفر الآن يتكفل بكل شيء (التكرار، الدفعات، التوسيع)
   */
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    // لا نحتاج لأي منطق هنا، فقط إرسال واستقبال
    return await this.callBackend('bulk_improve', { sections });
  }

  /**
   * تحسين قسم واحد (اختياري)
   * إذا كنت تستخدمه في واجهتك
   */
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const data = await this.callBackend('improve', { title, content });
    return {
        original: content,
        improved: data.improvedContent || content // fallback to original
    };
  }

  /**
   * مطابقة الوظيفة (اختياري)
   */
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
}
