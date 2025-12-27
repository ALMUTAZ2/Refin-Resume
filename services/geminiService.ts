import Groq from "groq-sdk";
import { AnalysisResult, JobMatchResult, ResumeSection, ImprovedContent } from "../types";

export class GeminiService {
  private groq: Groq;
  
  // ✅ استخدام أحدث وأقوى موديل من ميتا (Llama 3.3)
  private readonly MODEL_NAME = 'llama-3.3-70b-versatile';

  constructor() {
    // سنستخدم المتغير الموجود في Vercel
    const apiKey = (process.env as any).API_KEY; 
    
    if (!apiKey) {
      throw new Error("API Key is missing. Check Vercel Environment Variables.");
    }

    this.groq = new Groq({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // ضروري للعمل من المتصفح
    });
  }

  // 🛠️ دالة تنظيف الـ JSON (محسنة لتجنب الأخطاء)
  private cleanAndParseJSON(text: string): any {
    if (!text) return {};
    try {
      // إزالة أي علامات كود Markdown
      let cleanText = text.replace(/```json\s*|\s*```/g, "").trim();
      
      // محاولة العثور على بداية ونهاية الـ JSON فقط
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }
      return JSON.parse(cleanText);
    } catch (e) {
      console.error("JSON Parsing Error:", text);
      // إرجاع كائن فارغ آمن بدلاً من تحطيم الموقع
      return { summaryFeedback: "Error processing AI response." };
    }
  }

  // ==========================================
  // 1. تحليل السيرة الذاتية (Analyze Resume)
  // ==========================================
  async analyzeResume(text: string): Promise<AnalysisResult> {
    console.log(`🚀 Starting Analysis with ${this.MODEL_NAME}...`);
    
    const prompt = `
      You are an expert ATS Resume Scanner. 
      Analyze the following resume text.
      
      CRITICAL INSTRUCTION: Return ONLY valid JSON. Do not write any introduction.
      If the resume is in Arabic, provide the summary and feedback in Arabic.
      
      RESUME CONTENT:
      ${text.substring(0, 25000)}

      REQUIRED JSON STRUCTURE:
      {
        "extractedHeadlines": ["Current Job Title"],
        "parsingFlags": { 
          "isGraphic": false, 
          "hasColumns": false, 
          "hasTables": false, 
          "hasStandardSectionHeaders": true, 
          "contactInfoInHeader": false 
        },
        "hardSkillsFound": ["Skill A", "Skill B"],
        "softSkillsFound": ["Trait A", "Trait B"],
        "metrics": { 
          "totalBulletPoints": 0, 
          "bulletsWithMetrics": 0, 
          "sectionCount": 0 
        },
        "formattingIssues": ["Issue 1"],
        "summaryFeedback": "Professional feedback here.",
        "structuredSections": [
          { "id": "1", "title": "Experience", "content": "Raw content..." }
        ]
      }
    `;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: this.MODEL_NAME,
        temperature: 0, // دقة عالية جداً
        response_format: { type: "json_object" } // إجبار الموديل على JSON
      });

      const data = this.cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      
      // معادلة حساب السكور (Score Calculation)
      const score = Math.min(100, Math.max(10, 
        ((data.metrics?.bulletsWithMetrics || 0) * 6) + 
        ((data.hardSkillsFound?.length || 0) * 2) + 
        40
      ));

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
        overallScore: score
      };
    } catch (err) {
      console.error("Groq/Llama Error:", err);
      throw new Error("فشل الاتصال بخدمة التحليل الذكي (Groq).");
    }
  }

  // ==========================================
  // 2. تحسين الأقسام (Improve Section)
  // ==========================================
  async improveSection(title: string, content: string): Promise<ImprovedContent> {
    const prompt = `
      Task: Rewrite resume section "${title}".
      Goals: 
      1. Use strong action verbs.
      2. Keep it professional and concise (Executive Tone).
      3. Optimize for ATS keywords.
      
      Output JSON: { "professional": "Improved Version", "atsOptimized": "Keyword Heavy Version" }
      
      Content to rewrite:
      ${content}
    `;

    const completion = await this.groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: this.MODEL_NAME,
      response_format: { type: "json_object" }
    });

    return this.cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  }

  // ==========================================
  // 3. مطابقة الوظيفة (Job Match)
  // ==========================================
  async matchJobDescription(resumeText: string, sections: any[], jd: string): Promise<JobMatchResult> {
    const prompt = `
      Act as a Recruiter. Compare this Resume against the Job Description (JD).
      
      JD: ${jd.substring(0, 4000)}
      RESUME: ${resumeText.substring(0, 10000)}
      
      Return JSON:
      {
        "matchedCoreKeywords": ["List matched keywords"],
        "missingCoreKeywords": ["List missing keywords from JD"],
        "matchFeedback": "Brief advice on how to improve fit.",
        "matchPercentage": (Number 0-100)
      }
    `;

    const completion = await this.groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: this.MODEL_NAME,
      response_format: { type: "json_object" }
    });
    
    const data = this.cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");

    return {
      matchingKeywords: data.matchedCoreKeywords || [],
      missingKeywords: data.missingCoreKeywords || [],
      matchFeedback: data.matchFeedback || "",
      matchPercentage: data.matchPercentage || 50,
      tailoredSections: []
    };
  }
  
  // دالة فارغة للتوافق مع باقي التطبيق
  async bulkImproveATS(sections: ResumeSection[]): Promise<Record<string, string>> { return {}; }
}

