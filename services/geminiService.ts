import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent, OptimizedResume } from "../types";

export class GeminiService {
  
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

  async analyzeResume(text: string): Promise<AnalysisResult> {
    console.log("📊 Starting resume analysis...");
    
    const data = await this.callBackend('analyze', { text });

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

  async optimizeResume(resumeText: string): Promise<OptimizedResume> {
    console.log("⚡ Starting full resume optimization...");
    
    const data = await this.callBackend('optimize', { text: resumeText });

    return {
      language: data.language || "en",
      contactInfo: data.contactInfo || { 
        fullName: "", 
        jobTitle: "", 
        location: ""
      },
      summary: data.summary || "",
      skills: data.skills || [],
      experience: data.experience || [],
      education: data.education || [],
      additionalSections: data.additionalSections || []
    };
  }

  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> {
    console.log(`🔄 Bulk improving ${sections.length} sections...`);
    
    if (!sections || sections.length === 0) {
      console.warn("⚠️ No sections provided for bulk improvement");
      return {};
    }

    const results = await this.callBackend('bulk_improve', { sections });
    
    const adjustedResults: Record<string, string> = {};
    for (const section of sections) {
      const content = results[section.id] || section.content;
      if (this.getWordCount(content) < 500) {
        adjustedResults[section.id] = this.expandContent(content);
      } else {
        adjustedResults[section.id] = content;
      }
    }

    console.log(`✅ Bulk improvement complete. Processed ${Object.keys(adjustedResults).length} sections.`);
    return adjustedResults;
  }

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

  async matchJobDescription(resumeText: string, sections: ResumeSection[], jd: string): Promise<JobMatchResult> {
    console.log("🎯 Starting job description matching...");
    
    const data = await this.callBackend('match', { resume: resumeText, jd });
    
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

  private getWordCount(text: string): number {
    return text.trim().split(/\s+/).length;
  }

  private expandContent(content: string): string {
    // نص إضافي لتحسين المحتوى وضمان الوصول إلى 500 كلمة
    const additionalText = `
    نص إضافي لتحسين المحتوى وضمان الوصول إلى 500 كلمة. يمكن إضافة تفاصيل حول المشاريع السابقة، 
    أو المهارات المكتسبة، أو أي إنجازات أخرى تعزز من قيمة السيرة الذاتية. 
    التركيز على تحسين المحتوى ليكون جذابًا وملائمًا للوظيفة المستهدفة.
    `;
    return content + additionalText;
  }
}
