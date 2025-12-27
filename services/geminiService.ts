import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  
  // دالة الاتصال الموحدة بالسيرفر الخلفي
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
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

  // 1. تحليل السيرة
  async analyzeResume(text: string): Promise<AnalysisResult> {
    const data = await this.callBackend('analyze', { text });
    
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

  // 2. التحسين الشامل (Bulk Improve)
  // هذه الدالة ترسل الأقسام للسيرفر ليعالجها Llama 3.3
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    return await this.callBackend('bulk_improve', { sections });
  }

  // 3. تحسين قسم واحد
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    return await this.callBackend('improve', { title, content });
  }

  // 4. مطابقة الوظيفة
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

