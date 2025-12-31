import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.API_KEY });
const SMART_MODEL = "llama-3.3-70b-versatile"; 

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// ================= Helpers =================

function safeJSON(text) {
  try {
    let t = text.replace(/```json|```/g, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b !== -1) t = t.substring(a, b + 1);
    return JSON.parse(t);
  } catch (e) {
    console.error("❌ JSON PARSING FAILED:", e);
    return null;
  }
}

function sanitizeResumeData(data) {
  if (!data) return {};

  const extractText = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val.replace(/^[\s•\-\*]+/, "").trim();
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.map(extractText).join(". ");
    if (typeof val === 'object') return Object.values(val).map(v => extractText(v)).filter(v => v).join(", ");
    return String(val);
  };

  const flattenList = (arr) => {
    if (!arr) return [];
    if (!Array.isArray(arr)) { const t = extractText(arr); return t ? [t] : []; }
    return arr.map(item => extractText(item)).filter(s => s.length > 0);
  };

  return {
    language: data.language || "en",
    contactInfo: {
      fullName: extractText(data.contactInfo?.fullName),
      jobTitle: extractText(data.contactInfo?.jobTitle),
      location: extractText(data.contactInfo?.location),
      email: extractText(data.contactInfo?.email),
      phone: extractText(data.contactInfo?.phone),
      linkedin: extractText(data.contactInfo?.linkedin),
    },
    summary: extractText(data.summary),
    skills: flattenList(data.skills),
    experience: Array.isArray(data.experience) ? data.experience.map(exp => ({
      company: extractText(exp.company),
      role: extractText(exp.role),
      period: extractText(exp.period),
      achievements: flattenList(exp.achievements) 
    })) : [],
    education: Array.isArray(data.education) ? data.education.map(edu => ({
      degree: extractText(edu.degree),
      school: extractText(edu.school),
      year: extractText(edu.year)
    })) : [],
    additionalSections: Array.isArray(data.additionalSections) ? data.additionalSections.map(sec => ({
      title: extractText(sec.title),
      content: flattenList(sec.content)
    })) : []
  };
}

// ================= ANALYZE ACTION =================
async function handleAnalyze(text) {
  if (!text || text.length < 50) {
    throw new Error("Resume text is too short or empty");
  }

  const prompt = `
You are an expert ATS Resume Analyzer. Analyze the following resume and provide a comprehensive evaluation.

RESUME TEXT:
"${text.substring(0, 30000)}"

Provide your analysis in this EXACT JSON format:
{
  "extractedHeadlines": ["Job Title 1", "Job Title 2"],
  "hardSkillsFound": ["Skill1", "Skill2", "Skill3"],
  "softSkillsFound": ["Communication", "Leadership"],
  "metrics": {
    "totalBulletPoints": 0,
    "bulletsWithMetrics": 0,
    "weakVerbsCount": 0,
    "sectionCount": 0
  },
  "formattingIssues": ["Issue 1", "Issue 2"],
  "summaryFeedback": "Brief assessment of the resume quality",
  "structuredSections": [
    {
      "id": "section_1",
      "title": "Professional Summary",
      "content": "<p>Content here</p>"
    }
  ],
  "overallScore": 75,
  "parsingFlags": {
    "isGraphic": false,
    "hasColumns": false,
    "hasTables": false,
    "hasStandardSectionHeaders": true,
    "contactInfoInHeader": true
  }
}

IMPORTANT:
- Extract ALL sections (Summary, Experience, Education, Skills, Projects, Certifications, Languages, etc.)
- Each section must have a unique id like "section_1", "section_2", etc.
- Content should be formatted in HTML (use <p>, <ul>, <li> tags)
- Count all bullet points and identify which ones contain metrics (numbers, percentages)
- Overall score should be 0-100 based on ATS compatibility
`;

  const response = await groq.chat.completions.create({
    model: SMART_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 8000,
    response_format: { type: "json_object" }
  });

  const rawContent = response.choices[0]?.message?.content || "{}";
  const parsed = safeJSON(rawContent);
  
  if (!parsed) {
    throw new Error("Failed to parse AI response");
  }

  return parsed;
}

// ================= BULK IMPROVE ACTION =================
async function handleBulkImprove(sections) {
  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    throw new Error("No sections provided for improvement");
  }

  console.log(`🔄 Processing ${sections.length} sections for ATS optimization...`);

  const results = {};

  for (const section of sections) {
    const prompt = `
You are an ATS Optimization Expert. Rewrite the following resume section to maximize ATS compatibility and professional impact.

SECTION TITLE: ${section.title}
CURRENT CONTENT: ${section.content}

REQUIREMENTS:
1. Use strong action verbs (Led, Developed, Implemented, Achieved, etc.)
2. Include quantifiable metrics wherever possible (percentages, numbers, timeframes)
3. Optimize keywords for ATS scanning
4. Maintain professional tone
5. Format using HTML tags (<p>, <ul>, <li>, <strong>)
6. Expand content to 500-700 words if the section is core (Experience, Skills, Summary)
7. Keep bullet points concise but impactful

Return ONLY the improved HTML content, no explanations or JSON.
`;

    try {
      const response = await groq.chat.completions.create({
        model: SMART_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2000
      });

      const improvedContent = response.choices[0]?.message?.content || section.content;
      results[section.id] = improvedContent.trim();
      
      console.log(`✅ Improved section: ${section.title}`);
    } catch (err) {
      console.error(`❌ Failed to improve section ${section.title}:`, err);
      results[section.id] = section.content; // Fallback to original
    }
  }

  return results;
}

// ================= MATCH ACTION =================
async function handleMatch(resume, jd) {
  if (!resume || !jd) {
    throw new Error("Both resume and job description are required");
  }

  const prompt = `
You are a Job Matching AI. Compare this resume against the job description and provide matching analysis.

RESUME:
"${resume.substring(0, 20000)}"

JOB DESCRIPTION:
"${jd.substring(0, 10000)}"

Provide analysis in this JSON format:
{
  "matchPercentage": 75,
  "matchedCoreKeywords": ["Keyword1", "Keyword2"],
  "missingCoreKeywords": ["Keyword3", "Keyword4"],
  "matchFeedback": "Detailed feedback about the match quality and recommendations"
}
`;

  const response = await groq.chat.completions.create({
    model: SMART_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" }
  });

  const rawContent = response.choices[0]?.message?.content || "{}";
  return safeJSON(rawContent) || {
    matchPercentage: 0,
    matchedCoreKeywords: [],
    missingCoreKeywords: [],
    matchFeedback: "Unable to analyze match"
  };
}

// ================= MAIN HANDLER =================
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, payload } = req.body || {};

  try {
    console.log(`📥 Received action: ${action}`);

    // Route to appropriate handler
    if (action === "analyze") {
      const result = await handleAnalyze(payload.text);
      return res.status(200).json(result);
    }

    if (action === "optimize") {
      console.log("🔥 [DEBUG] Received Text Length:", payload.text?.length);
      
      if (!payload.text || payload.text.length < 50) {
        return res.status(400).json({ error: true, message: "Resume text is empty or failed to extract." });
      }

      const prompt = `
You are a Resume Architect.
INPUT TEXT: "${payload.text.substring(0, 30000)}"

TASK: Extract all data into this JSON structure. 
CRITICAL: Do NOT skip any section (Languages, Courses, Projects).

JSON OUTPUT:
{
  "language": "en",
  "contactInfo": { "fullName": "", "jobTitle": "", "location": "", "email": "", "phone": "" },
  "summary": "",
  "skills": [],
  "experience": [{ "company": "", "role": "", "period": "", "achievements": [] }],
  "education": [{ "degree": "", "school": "", "year": "" }],
  "additionalSections": [{ "title": "", "content": [] }]
}
`;

      const r = await groq.chat.completions.create({
        model: SMART_MODEL, 
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, 
        max_tokens: 7000, 
        response_format: { type: "json_object" },
      });

      const rawResponse = r.choices[0]?.message?.content || "";
      const rawData = safeJSON(rawResponse);
      
      if (!rawData) {
        return res.status(500).json({ error: true, message: "AI generated invalid JSON" });
      }

      const cleanData = sanitizeResumeData(rawData);
      return res.status(200).json(cleanData);
    }

    if (action === "bulk_improve") {
      const results = await handleBulkImprove(payload.sections);
      return res.status(200).json(results);
    }

    if (action === "match") {
      const results = await handleMatch(payload.resume, payload.jd);
      return res.status(200).json(results);
    }

    // Unknown action
    return res.status(400).json({ error: true, message: `Unknown action: ${action}` });

  } catch (error) {
    console.error("💥 [FATAL ERROR]:", error);
    return res.status(500).json({ error: true, message: error.message });
  }
}
