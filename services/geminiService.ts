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
        throw new Error(`Server Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to call backend for ${action}:`, error);
      throw error;
    }
  }

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

  // ============================================================
  // 🧠 الحل الذكي: التجميع الديناميكي (Smart Dynamic Batching)
  // يوازن بين سرعة Vercel وتوفير التوكنز
  // ============================================================
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { 
    
    // إعدادات الحزمة الآمنة (لكي لا ينقطع الاتصال في Vercel)
    // Llama 70B يعالج حوالي 300 كلمة بسرعة مقبولة داخل الـ 10 ثواني
    const MAX_WORDS_PER_BATCH = 250; 

    const batches: ResumeSection[][] = [];
    let currentBatch: ResumeSection[] = [];
    let currentBatchWordCount = 0;

    // 1. خوارزمية التوزيع
    for (const section of sections) {
        const sectionWords = section.content.split(/\s+/).length;
        const isHeavySection = section.title.toLowerCase().includes('experience') || section.title.toLowerCase().includes('work');

        // إذا كان القسم "ثقيل" جداً (أكثر من الحد)، نضعه في حزمة لوحده فوراً
        if (isHeavySection && sectionWords > 150) {
            // نغلق الحزمة الحالية إذا فيها عناصر
            if (currentBatch.length > 0) {
                batches.push(currentBatch);
                currentBatch = [];
                currentBatchWordCount = 0;
            }
            // نضيف الثقيل كحزمة مستقلة
            batches.push([section]);
            continue;
        }

        // إذا إضافة القسم ستتجاوز الحد المسموح، نغلق الحزمة ونفتح جديدة
        if (currentBatchWordCount + sectionWords > MAX_WORDS_PER_BATCH) {
            batches.push(currentBatch);
            currentBatch = [];
            currentBatchWordCount = 0;
        }

        // نضيف القسم للحزمة الحالية
        currentBatch.push(section);
        currentBatchWordCount += sectionWords;
    }

    // إضافة البواقي
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    console.log(`Smart Batching: Optimized into ${batches.length} requests (instead of ${sections.length}).`);

    // 2. إرسال الحزم بشكل متوازي (Parallel Execution)
    const promises = batches.map(async (batchSections) => {
        try {
            // نستخدم نفس الدالة الموجودة في السيرفر (bulk_improve)
            // السيرفر مجهز ليستقبل مصفوفة، لذا سيعمل فوراً
            const result = await this.callBackend('bulk_improve', { sections: batchSections });
            return result; // يعيد كائن { id: content, id2: content }
        } catch (e) {
            console.error("Batch failed", e);
            // في حال فشل حزمة، نعيد المحتوى القديم للأقسام التي فيها حتى لا تختفي
            const fallback: Record<string, string> = {};
            batchSections.forEach(s => fallback[s.id] = s.content);
            return fallback;
        }
    });

    // 3. تجميع النتائج من جميع الحزم
    const results = await Promise.all(promises);
    
    const finalMapping: Record<string, string> = {};
    results.forEach(chunkResult => {
        Object.assign(finalMapping, chunkResult);
    });
    
    return finalMapping;
  }

  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    return await this.callBackend('improve', { title, content });
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

