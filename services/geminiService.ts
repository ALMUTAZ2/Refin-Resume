import { GoogleGenAI } from "@google/genai";
import { DetailedAnalysis, OptimizedResume } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_NAME = "gemini-3-pro-preview";

export const performResumeAudit = async (resumeText: string): Promise<DetailedAnalysis> => {
  const prompt = `
    You are an "Ultra-Strict Resume Auditor". 
    Analyze this resume text and provide a blunt assessment.
    Return ONLY JSON in the resume's language:
    {
      "score": number,
      "breakdown": { "searchability": number, "quantification": number, "formatting": number, "structure": number, "style": number },
      "executiveSummary": "Critique summary",
      "impactMetrics": ["found stats"],
      "improvements": [{"category": "Section", "suggestion": "Specific fix", "priority": "high"}],
      "topKeywordsFound": ["keywords"],
      "atsWarnings": [{"type": "critical", "message": "ATS issue"}],
      "professionalLevel": "Level"
    }
    Content: "${resumeText.slice(0, 10000)}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    throw new Error("Failed to audit resume.");
  }
};

export const optimizeResume = async (resumeText: string): Promise<OptimizedResume> => {
  const prompt = `
    You are an expert ATS Resume Strategist and Executive Writer.
    TASK: Transform the user's data into a highly detailed, 500-700 word resume.
    
    STRICT CONTENT RULES:
    1. WORD COUNT: Aim for 500-700 words. Be verbose but professional. 
    2. STAR METHOD: For every job duty, describe the Situation, Task, Action, and Result in detail.
    3. QUANTIFY: Use numbers (%, $, time, volume) in every experience bullet point.
    4. NO OMISSION: Ensure EVERY section from the original resume is included and expanded.
    
    ATS STRUCTURAL ORDER (Mandatory):
    1. Header (Name, Job Title, Location)
    2. Professional Summary (Detailed paragraph, 100+ words)
    3. Core Competencies & Skills (Searchable keyword list)
    4. Professional Experience (The largest section, highly detailed)
    5. Projects, Certifications, or Volunteer Work
    6. Education
    
    Return ONLY JSON:
    {
      "language": "en" | "ar",
      "contactInfo": { "fullName": "", "jobTitle": "", "location": "" },
      "summary": "Verbose professional summary (100-120 words)",
      "skills": ["skill1", "skill2", "...at least 20 relevant skills"],
      "experience": [
        { "company": "", "role": "", "period": "", "achievements": ["Highly detailed bullet point with metrics...", "Another detailed achievement..."] }
      ],
      "education": [{ "degree": "", "school": "", "year": "" }],
      "additionalSections": [{ "title": "Projects / Certifications", "content": ["Extremely detailed project description...", "..."] }]
    }

    Resume Content: "${resumeText.slice(0, 12000)}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.2 },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    throw new Error("Failed to optimize resume.");
  }
};
