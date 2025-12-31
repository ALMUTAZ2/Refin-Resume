import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent, OptimizedResume } from "../types";

export class GeminiService {
  
  /**
   * دالة مركزية للاتصال بالـ Backend (Groq API)
   */
  private async callBackend(action: string, payload: any): Promise<any> {
    try {
      console.log(`🚀 Calling backend action: ${action}`);
      
      const response = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Server Error (${response.status}): ${errorText}`);
        throw new Error(`Server Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (data.error === true) {
        console.error(`❌ API Logic Error for ${action}:`, data.message);
        throw new Error(data.message || `API Error for action: ${action}`);
      }

      console.log(`✅ Backend response received for ${action}`);
      return data;
    } catch (error) {
      console.error(`💥 GeminiService Error [${action}]:`, error);
      throw error;
    }
  }

  // ================= الوظائف =================

  /**
   * تحليل السيرة الذاتية
   */
  async analyzeResume(text: string): Promise<AnalysisResult> {
    console.log("📊 Starting resume analysis...");
    
    const data = await this.callBackend('analyze', { text });

    // Ensure all sections have proper structure
    const structuredSections = (data.structuredSections || []).map((section: any, index: number) => ({
      id: section.id || `section_${index + 1}`,
      title: section.title || "Untitled Section",
      content: section.content || "",
      originalContent: section.content || ""
    }));

    console.log(`✅ Analysis complete. Found ${structuredSections.length} sections.`);

    return {
      detectedRole: data.extractedHeadlines?.[0] || "Professional",
      parsingFlags: data.parsingFlags || {
        isGraphic: false, 
        hasColumns: false, 
        hasTables: false, 
        hasStandardSectionHeaders: true, 
        contactInfoInHeader: true
      },
      hardSkillsFound: data.hardSkillsFound || [],
      softSkillsFound: data.softSkillsFound || [],
      missingHardSkills: data.missingHardSkills || [],
      metrics: data.metrics || { 
        totalBulletPoints: 0, 
        bulletsWithMetrics: 0, 
        weakVerbsCount: 0, 
        sectionCount: structuredSections.length
      },
      formattingIssues: data.formattingIssues || [],
      criticalErrors: data.criticalErrors || [],
      strengths: data.strengths || [],
      weaknesses: data.weaknesses || [],
      summaryFeedback: data.summaryFeedback || "Resume analyzed successfully.",
      structuredSections: structuredSections,
      overallScore: data.overallScore || 50
    };
  }

  /**
   * ✅ الميزة الجديدة: تحسين السيرة الذاتية بالكامل
   */
  async optimizeResume(resumeText: string): Promise<OptimizedResume> {
    console.log("⚡ Starting full resume optimization...");
    
    const data = await this.callBackend('optimize', { text: resumeText });

    return {
      language: data.language || "en",
      contactInfo: data.contactInfo || { 
        fullName: "", 
        jobTitle: "", 
        location: "",
        email: "",
        phone: "",
        linkedin: ""
      },
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
    console.log(`🔄 Bulk improving ${sections.length} sections...`);
    
    if (!sections || sections.length === 0) {
      console.warn("⚠️ No sections provided for bulk improvement");
      return {};
    }

    const results = await this.callBackend('bulk_improve', { sections });
    
    console.log(`✅ Bulk improvement complete. Processed ${Object.keys(results).length} sections.`);
    return results;
  }

  /**
   * تحسين قسم واحد
   */
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    console.log(`✨ Improving single section: ${title}`);
    
    const mockSection = { id: 'temp_single', title, content };
    const response = await this.callBackend('bulk_improve', { sections: [mockSection] });
    
    const newContent = response['temp_single'] || content;

    return { 
      professional: newContent, 
      atsOptimized: newContent 
    };
  }

  /**
   * مطابقة الوظيفة
   */
  async matchJobDescription(resumeText: string, sections: ResumeSection[], jd: string): Promise<JobMatchResult> {
    console.log("🎯 Starting job description matching...");
    
    const data = await this.callBackend('match', { resume: resumeText, jd });
    
    // Create tailored sections by improving all sections with JD context
    console.log("📝 Creating tailored sections...");
    const tailoredSections = await Promise.all(
      sections.map(async (section) => {
        try {
          const improvedResult = await this.callBackend('bulk_improve', { 
            sections: [{
              ...section,
              content: `${section.content}\n\nTAILOR THIS TO MATCH: ${jd.substring(0, 500)}`
            }] 
          });
          
          return {
            ...section,
            content: improvedResult[section.id] || section.content,
            originalContent: section.content
          };
        } catch (err) {
          console.warn(`⚠️ Failed to tailor section ${section.title}, using original`);
          return section;
        }
      })
    );
    
    console.log(`✅ Job matching complete. Match: ${data.matchPercentage}%`);
    
    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "Analysis completed successfully.",
      matchPercentage: data.matchPercentage || 0,
      tailoredSections: tailoredSections
    };
  }
}
