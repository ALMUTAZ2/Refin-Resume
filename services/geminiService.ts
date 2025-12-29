import {
  AnalysisResult,
  JobMatchResult,
  ResumeSection,
  ImprovedContent,
} from "../types";

/**
 * قيم افتراضية مطابقة للـ Types
 * لمنع أخطاء TypeScript
 */
const DEFAULT_PARSING_FLAGS = {
  isGraphic: false,
  hasColumns: false,
  hasTables: false,
  hasStandardSectionHeaders: true,
  contactInfoInHeader: false,
};

const DEFAULT_METRICS = {
  totalBulletPoints: 0,
  bulletsWithMetrics: 0,
  weakVerbsCount: 0,
  sectionCount: 0,
};

export class GeminiService {
  /**
   * دالة موحدة للتواصل مع API
   * تعالج أخطاء الشبكة والمنطق
   */
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
      const response = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // في حال رجّع السيرفر خطأ منطقي لكن بدون كسر
      if (data?.error === true) {
        console.warn(`API logic warning for action: ${action}`);
        return {};
      }

      return data;
    } catch (error) {
      console.error(`GeminiService Error [${action}]:`, error);
      throw error;
    }
  }

  /**
   * تحليل السيرة الذاتية
   * (استخراج الأقسام فقط – موديل سريع)
   */
  async analyzeResume(text: string): Promise<AnalysisResult> {
    const data = await this.callBackend("analyze", { text });

    return {
      detectedRole: "Candidate",
      parsingFlags: data.parsingFlags ?? DEFAULT_PARSING_FLAGS,
      hardSkillsFound: [],
      softSkillsFound: [],
      missingHardSkills: [],
      metrics: data.metrics ?? DEFAULT_METRICS,
      formattingIssues: [],
      criticalErrors: [],
      strengths: [],
      weaknesses: [],
      summaryFeedback: "Ready for optimization.",
      structuredSections: data.structuredSections || [],
      overallScore: data.overallScore || 50,
    };
  }

  /**
   * التحسين الشامل (Bulk Improve)
   * السيرفر يتكفل بكل الذكاء والتوزيع
   */
  async bulkImproveATS(
    sections: ResumeSection[]
  ): Promise<Record<string, string>> {
    return await this.callBackend("bulk_improve", { sections });
  }

  /**
   * تحسين قسم واحد (اختياري)
   */
  async improveSection(
    title: string,
    content: string
  ): Promise<ImprovedContent> {
    const data = await this.callBackend("improve", { title, content });

    return {
      improved: data.improvedContent || content,
    };
  }

  /**
   * مطابقة السيرة مع وصف وظيفي (اختياري)
   */
  async matchJobDescription(
    resumeText: string,
    sections: any[],
    jd: string
  ): Promise<JobMatchResult> {
    const data = await this.callBackend("match", {
      resume: resumeText,
      jd,
    });

    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "",
      matchPercentage: data.matchPercentage || 0,
      tailoredSections: [],
    };
  }
}
