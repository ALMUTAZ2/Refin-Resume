import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  
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

  async analyzeResume(text: string): Promise<AnalysisResult> {
    const data = await this.callBackend('analyze', { text });

    return {
      detectedRole: data.extractedHeadlines?.[0] || "Unknown",
      
      // ✅ تصحيح 1: وضع قيم افتراضية كاملة لـ parsingFlags
      parsingFlags: data.parsingFlags || {
        isGraphic: false,
        hasColumns: false,
        hasTables: false,
        hasStandardSectionHeaders: true,
        contactInfoInHeader: true
      },
      
      hardSkillsFound: data.hardSkillsFound || [],
      softSkillsFound: data.softSkillsFound || [],
      missingHardSkills: [],
      
      // ✅ تصحيح 2: وضع قيم افتراضية كاملة لـ metrics
      metrics: data.metrics || {
        totalBulletPoints: 0,
        bulletsWithMetrics: 0,
        weakVerbsCount: 0,
        sectionCount: 0
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

  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    return await this.callBackend('bulk_improve', { sections });
  }

  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const data = await this.callBackend('improve', { title, content });
    
    // ✅ تصحيح 3: إزالة 'original' لأن الـ Interface لا تحتوي عليها
    // وافتراض أن ImprovedContent تحتوي على 'improvedContent'
    return {
        improvedContent: data.improvedContent || content
    } as ImprovedContent; // استخدام as لضمان التوافق
  }

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

