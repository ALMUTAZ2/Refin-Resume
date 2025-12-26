// ✅ التعديل هنا: استيراد المكتبة المستقرة بدلاً من genai القديمة
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  
  // ✅ الموديل 1.5 فلاش (المستقر)
  private readonly MODEL_NAME = 'gemini-1.5-flash-001';
 
  constructor() {
    const apiKey = (process.env as any).API_KEY;
    if (!apiKey || apiKey.includes("---") || apiKey.length < 10) {
      throw new Error("API Key Invalid: Please check your .env.local file.");
    }
    // تهيئة المكتبة الجديدة
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // ==========================================
  // 🛠️ Helpers
  // ==========================================

  private async withRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
      }
    }
    throw new Error("Network Error");
  }

  private cleanAndParseJSON(text: string): any {
    try {
      let cleanText = text.replace(/```json\s*|\s*```/g, "").trim();
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      return JSON.parse(cleanText);
    } catch (e) {
      console.error("JSON Parse Failed:", text);
      throw new Error("فشل تحليل البيانات.");
    }
  }

  // ==========================================
  // ⚖️ Logic: Strict ATS Scoring
  // ==========================================
  private calculateATSScore(data: any): number {
    const flags = data?.parsingFlags || {};
    
    // Kill Switch
    if (flags.isGraphic || flags.hasColumns || flags.hasTables) {
      return 35; 
    }

    // Penalties
    let penalty = 0;
    if (!flags.hasStandardSectionHeaders) penalty += 20; 
    if (flags.contactInfoInHeader) penalty += 15;

    // Scoring
    const metrics = data?.metrics || {};
    const totalBullets = Math.max(metrics.totalBulletPoints || 1, 1);
    const bulletsWithNumbers = metrics.bulletsWithMetrics || 0;
    
    const metricsRatio = Math.min(bulletsWithNumbers / totalBullets, 0.4) / 0.4; 
    const impactScore = metricsRatio * 40;

    const hardSkillsCount = data?.hardSkillsFound?.length || 0;
    const skillsScore = Math.min(hardSkillsCount, 8) / 8 * 30;

    const sections = data?.structuredSections?.map((s: any) => s.title.toLowerCase()) || [];
    let structurePoints = 0;
    if (sections.some((s: string) => s.includes('experience') || s.includes('work'))) structurePoints += 5;
    if (sections.some((s: string) => s.includes('education'))) structurePoints += 5;
    if (sections.some((s: string) => s.includes('skill'))) structurePoints += 5;
    if (sections.length >= 4) structurePoints += 5;
    
    const minorIssues = (data?.formattingIssues?.length || 0);
    const formattingScore = Math.max(0, 10 - (minorIssues * 2));

    const finalScore = Math.max(0, (impactScore + skillsScore + structurePoints + formattingScore) - penalty);
    
    return Math.round(Math.max(10, Math.min(100, finalScore)));
  }

  // ==========================================
  // 🚀 Core Features (Updated for new SDK)
  // ==========================================

  async analyzeResume(text: string): Promise<AnalysisResult> {
    const systemInstruction = `
      ROLE: Strict Legacy ATS Parser.
      OBJECTIVE: Detect structural parsing failures.
      RULES:
      1. NO INFERENCE: Do not guess roles or skills.
      2. BOOLEAN FLAGS ONLY: For 'hasColumns', 'hasTables', 'isGraphic'.
      3. LITERAL EXTRACTION: Copy text exactly.
      OUTPUT: Strict JSON only.
    `;

    return this.withRetry(async () => {
      // ✅ طريقة الاستدعاء الجديدة
      const model = this.genAI.getGenerativeModel({
        model: this.MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.0,
        }
      });

      const prompt = `${systemInstruction}\n\nRESUME RAW TEXT:\n${text}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      const data = this.cleanAndParseJSON(response.text());
      
      const sanitized: AnalysisResult = {
        detectedRole: data.extractedHeadlines?.[0] || "", 
        parsingFlags: data.parsingFlags || { isGraphic: false, hasColumns: false, hasTables: false, hasStandardSectionHeaders: true, contactInfoInHeader: false },
        hardSkillsFound: data.hardSkillsFound || [],
        softSkillsFound: data.softSkillsFound || [],
        missingHardSkills: [], 
        metrics: {
          totalBulletPoints: data.metrics?.totalBulletPoints ?? 0,
          bulletsWithMetrics: data.metrics?.bulletsWithMetrics ?? 0,
          weakVerbsCount: 0, 
          sectionCount: data.metrics?.sectionCount ?? 0
        },
        formattingIssues: data.formattingIssues || [],
        criticalErrors: [], 
        strengths: [],
        weaknesses: [],
        summaryFeedback: data.summaryFeedback || "Analysis Complete",
        structuredSections: data.structuredSections || [],
      };

      sanitized.overallScore = this.calculateATSScore(sanitized);
      return sanitized;
    });
  }

  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> {
    const currentTotalWords = sections.reduce((acc, section) => acc + section.content.trim().split(/\s+/).length, 0);
    let targetWords = currentTotalWords;
    let strategy = "OPTIMIZE"; 

    if (currentTotalWords < 500) { targetWords = 520; strategy = "EXPAND"; } 
    else if (currentTotalWords > 700) { targetWords = 680; strategy = "CONDENSE"; }

    const weights: Record<string, number> = { 'experience': 0.65, 'projects': 0.15, 'summary': 0.10, 'education': 0.05, 'skills': 0.05 };

    const compressedInput = sections.map(s => {
      const type = s.title.toLowerCase();
      let weight = weights['experience']; 
      if (type.includes('summary')) weight = weights['summary'];
      else if (type.includes('project')) weight = weights['projects'];
      else if (type.includes('education')) weight = weights['education'];
      else if (type.includes('skill')) weight = weights['skills'];

      const sectionTarget = Math.round(targetWords * weight);
      return { id: s.id, type: s.title, content: s.content, instruction: `Strategy: ${strategy}. Target ~${sectionTarget} words.` };
    });

    return this.withRetry(async () => {
      const model = this.genAI.getGenerativeModel({
        model: this.MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.45,
        }
      });

      const prompt = `CONTEXT: Resume Rewriter. CONSTRAINT: 500-700 Words. STRATEGY: ${strategy}. INPUT: ${JSON.stringify(compressedInput)} OUTPUT: JSON Mapping {id: improved_html_content}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      const data = this.cleanAndParseJSON(response.text());
      const mapping: Record<string, string> = {};
      
      if (Array.isArray(data)) {
        data.forEach((item: any) => mapping[item.id] = item.improvedContent);
      } else if (data.improvedContent) {
        mapping[compressedInput[0].id] = data.improvedContent;
      }
      
      return mapping;
    });
  }

  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    return this.withRetry(async () => {
      const model = this.genAI.getGenerativeModel({
        model: this.MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.5,
        }
      });

      const prompt = `Rewrite section "${title}". 1. Professional: Executive tone. 2. ATS: Keyword-rich. Content: ${content}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      return this.cleanAndParseJSON(response.text());
    });
  }

  async matchJobDescription(resumeText: string, sections: ResumeSection[], jobDescription: string): Promise<JobMatchResult> {
    return this.withRetry(async () => {
      const cleanResume = resumeText.substring(0, 15000); 
      const cleanJD = jobDescription.substring(0, 5000);

      const model = this.genAI.getGenerativeModel({
        model: this.MODEL_NAME,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        }
      });

      const prompt = `
          TASK: Strict ATS Job Match.
          JD: ${cleanJD}
          RESUME: ${cleanResume}
          STEPS:
          1. Extract JD Keywords -> Categorize: "CORE" (Must-have) vs "SECONDARY" (Nice-to-have).
          2. LITERAL MATCHING against Resume (No inference).
          3. Rewrite "Experience" & "Summary" to include missing CORE keywords.
          OUTPUT JSON STRUCTURE:
          {
            "matchedCoreKeywords": ["string"],
            "missingCoreKeywords": ["string"],
            "matchedSecondaryKeywords": ["string"],
            "missingSecondaryKeywords": ["string"],
            "matchFeedback": "string",
            "tailoredSections": [{ "id": "string", "title": "string", "content": "string" }]
          }
        `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const data = this.cleanAndParseJSON(response.text());

      const coreMatch = data.matchedCoreKeywords?.length || 0;
      const coreMissing = data.missingCoreKeywords?.length || 0;
      const secMatch = data.matchedSecondaryKeywords?.length || 0;
      const secMissing = data.missingSecondaryKeywords?.length || 0;

      const totalWeightedPoints = ((coreMatch + coreMissing) * 3) + (secMatch + secMissing);
      const earnedWeightedPoints = (coreMatch * 3) + secMatch;

      const calculatedPercentage = totalWeightedPoints > 0 
        ? Math.round((earnedWeightedPoints / totalWeightedPoints) * 100) 
        : 0;

      return { 
        matchingKeywords: [...(data.matchedCoreKeywords || []), ...(data.matchedSecondaryKeywords || [])],
        missingKeywords: [...(data.missingCoreKeywords || []), ...(data.missingSecondaryKeywords || [])],
        matchFeedback: data.matchFeedback,
        tailoredSections: data.tailoredSections,
        matchPercentage: calculatedPercentage 
      };
    });
  }
}

