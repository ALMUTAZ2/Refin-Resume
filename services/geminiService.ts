import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  
  // دالة الاتصال الموحدة بالسيرفر الخلفي (Backend API)
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

  // ============================================================
  // 1. تحليل السيرة الذاتية (Analyze)
  // ============================================================
  async analyzeResume(text: string): Promise<AnalysisResult> {
    // نرسل النص للسيرفر ليقوم بالتحليل وحساب السكور
    const data = await this.callBackend('analyze', { text });
    
    // تنسيق البيانات المستلمة لضمان عدم حدوث أخطاء في الواجهة
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
      summaryFeedback: data.summaryFeedback || "Analysis Complete",
      structuredSections: data.structuredSections || [],
      overallScore: data.overallScore || 50
    };
  }

  // ============================================================
  // 2. التحسين الشامل السريع (Parallel Bulk Improve) 🚀
  // ============================================================
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    // أ) حساب استراتيجية التوسع أو الاختصار (يتم هنا في المتصفح لتوزيع المهام)
    const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
    let strategy = "OPTIMIZE";
    let targetWords = currentTotalWords;

    // قواعد الذكاء: إذا النص قصير جداً نوسعه، وإذا طويل جداً نختصره
    if (currentTotalWords < 450) {
        targetWords = 650; 
        strategy = "EXPAND significantly. Add professional details.";
    } else if (currentTotalWords > 800) {
        targetWords = 700;
        strategy = "CONDENSE";
    }

    // ب) توزيع الأوزان على الأقسام
    const weights: Record<string, number> = { 
      'experience': 0.65, 
      'projects': 0.15, 
      'summary': 0.10, 
      'education': 0.05, 
      'skills': 0.05 
    };

    // ج) إطلاق الطلبات بشكل متوازي (Parallel Requests)
    // هذا يرسل عدة طلبات صغيرة للسيرفر في نفس الوقت لتجنب البطء والـ Timeouts
    const promises = sections.map(async (section) => {
        const type = section.title.toLowerCase();
        let weight = weights['experience'] || 0.65;
        if (type.includes('summary')) weight = weights['summary'];
        else if (type.includes('project')) weight = weights['projects'];
        else if (type.includes('education')) weight = weights['education'];
        else if (type.includes('skill')) weight = weights['skills'];
        
        const sectionTarget = Math.round(targetWords * weight);
        
        try {
            // نرسل طلب خاص لكل قسم إلى الـ Endpoint الجديد في السيرفر
            const result = await this.callBackend('improve_with_instructions', {
                title: section.title,
                content: section.content,
                instruction: `Strategy: ${strategy}. Target Words: ~${sectionTarget}. Action: Rewrite fully.`,
            });
            // نرجع النتيجة المحسنة
            return { id: section.id, content: result.improvedContent };
        } catch (e) {
            console.error(`Error improving section ${section.title}`, e);
            // في حال فشل قسم واحد، نعيد النص الأصلي حتى لا تخرب السيرة كاملة
            return { id: section.id, content: section.content }; 
        }
    });

    // د) انتظار جميع الطلبات حتى تكتمل
    const results = await Promise.all(promises);
    
    // هـ) تجميع النتائج في كائن واحد
    const mapping: Record<string, string> = {};
    results.forEach(r => mapping[r.id] = r.content);
    
    return mapping;
  }

  // ============================================================
  // 3. تحسين قسم واحد (Improve Single Section)
  // ============================================================
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    return await this.callBackend('improve', { title, content });
  }

  // ============================================================
  // 4. مطابقة الوظيفة (Job Match)
  // ============================================================
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

