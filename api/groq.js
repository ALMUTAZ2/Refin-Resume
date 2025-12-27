import Groq from 'groq-sdk';

// 1. إعداد الاتصال الآمن بالسيرفر
const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// ==========================================
// 🛠️ Helpers
// ==========================================

function cleanAndParseJSON(text) {
  if (!text) return {};
  try {
    let cleanText = text.replace(/```json\s*|\s*```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
    const lastBrace = cleanText.lastIndexOf('}');
    const lastBracket = cleanText.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);

    if (start !== -1 && end !== -1) {
      cleanText = cleanText.substring(start, end + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { error: "Failed to parse JSON" };
  }
}

// حساب النقاط (Score Calculation)
function calculateATSScore(data) {
  const flags = data?.parsingFlags || {};
  if (flags.isGraphic || flags.hasColumns || flags.hasTables) return 35;

  let penalty = 0;
  if (!flags.hasStandardSectionHeaders) penalty += 20;
  if (flags.contactInfoInHeader) penalty += 15;

  const metrics = data?.metrics || {};
  const totalBullets = Math.max(metrics.totalBulletPoints || 1, 1);
  const bulletsWithMetrics = metrics.bulletsWithMetrics || 0;
  
  const impactScore = (Math.min(bulletsWithMetrics / totalBullets, 0.4) / 0.4) * 40;
  const hardSkillsCount = data?.hardSkillsFound?.length || 0;
  const skillsScore = (Math.min(hardSkillsCount, 8) / 8) * 30;
  
  const sections = data?.structuredSections?.map((s) => s.title.toLowerCase()) || [];
  let structurePoints = 0;
  if (sections.some((s) => s.includes('experience') || s.includes('work'))) structurePoints += 5;
  if (sections.some((s) => s.includes('education'))) structurePoints += 5;
  if (sections.some((s) => s.includes('skill'))) structurePoints += 5;
  if (sections.length >= 4) structurePoints += 5;
  
  const minorIssues = (data?.formattingIssues?.length || 0);
  const formattingScore = Math.max(0, 10 - (minorIssues * 2));

  return Math.round(Math.min(100, impactScore + skillsScore + structurePoints + formattingScore - penalty));
}

// ==========================================
// 🧠 Logic: Elastic Optimization (حل مشكلة قصر النص)
// ==========================================
async function handleBulkImprove(sections) {
  // 1. حساب الكلمات
  const currentTotalWords = sections.reduce((acc, section) => acc + section.content.trim().split(/\s+/).length, 0);
  
  // 2. تحديد الاستراتيجية
  let targetWords = currentTotalWords;
  let strategy = "OPTIMIZE";

  if (currentTotalWords < 450) { 
    targetWords = 650; // إجبار الموديل على التوسع إلى 650 كلمة
    strategy = "EXPAND significantly. Add details, use Star Method, and elaborate."; 
  } 
  else if (currentTotalWords > 800) { 
    targetWords = 700; 
    strategy = "CONDENSE and focus on impact."; 
  }

  // 3. تحضير التعليمات لكل قسم
  const weights = { 'experience': 0.65, 'projects': 0.15, 'summary': 0.10, 'education': 0.05, 'skills': 0.05 };

  const compressedInput = sections.map(s => {
    const type = s.title.toLowerCase();
    let weight = weights['experience'] || 0.65; 
    if (type.includes('summary')) weight = weights['summary'];
    
    const sectionTarget = Math.round(targetWords * weight);
    
    return { 
      id: s.id, 
      type: s.title, 
      content: s.content, 
      instruction: `Strategy: ${strategy}. Target Words: AT LEAST ${sectionTarget}. Action: Rewrite fully in HTML.` 
    };
  });

  const prompt = `
    ROLE: Executive Resume Writer.
    TASK: Rewrite resume sections based on strategy: ${strategy}.
    GLOBAL TARGET: ~${targetWords} words.
    
    CRITICAL RULES:
    1. EXPAND content if instructed. Use "Star Method".
    2. DO NOT SUMMARIZE. Write full professional paragraphs and bullets.
    3. FORMAT: Use HTML tags (<p>, <ul>, <li>, <strong>) strictly.
    4. LANGUAGE: If input is Arabic, output MUST be Arabic.
    5. RETURN: Valid JSON Array.
    
    INPUT: ${JSON.stringify(compressedInput)}
    
    OUTPUT SCHEMA:
    { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML Content" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.3, 
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  // استخراج البيانات بدقة مهما اختلف شكل الرد
  let items = [];
  if (data.improvedSections && Array.isArray(data.improvedSections)) items = data.improvedSections;
  else if (Array.isArray(data)) items = data;
  else items = Object.values(data).find(val => Array.isArray(val)) || [];

  const mapping = {};
  items.forEach(item => {
    if (item.id && item.improvedContent) mapping[item.id] = item.improvedContent;
  });

  return mapping;
}

// ==========================================
// 🚀 Main Handler
// ==========================================
export default async function handler(req, res) {
  // إعدادات CORS للسماح للواجهة بالاتصال
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    // 1. تحليل السيرة
    if (action === 'analyze') {
      const prompt = `
        ROLE: Expert ATS Resume Scanner.
        CRITICAL: Return ONLY valid JSON.
        RESUME: ${payload.text.substring(0, 25000)}
        OUTPUT JSON Schema:
        {
          "extractedHeadlines": ["string"],
          "parsingFlags": {"isGraphic": false, "hasColumns": false, "hasTables": false, "hasStandardSectionHeaders": true, "contactInfoInHeader": false},
          "hardSkillsFound": ["string"],
          "softSkillsFound": ["string"],
          "metrics": {"totalBulletPoints": 0, "bulletsWithMetrics": 0, "sectionCount": 0},
          "formattingIssues": ["string"],
          "summaryFeedback": "string",
          "structuredSections": [{"id": "string", "title": "string", "content": "string"}]
        }
      `;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result.overallScore = calculateATSScore(result);
    } 
    
    // 2. التحسين الشامل (Elastic)
    else if (action === 'bulk_improve') {
      result = await handleBulkImprove(payload.sections);
    }
    
    // 3. تحسين قسم واحد
    else if (action === 'improve') {
      const prompt = `Rewrite section "${payload.title}". Tone: Executive. Content: ${payload.content}. Output JSON: { "professional": "string", "atsOptimized": "string" }`;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    // 4. مطابقة الوظيفة
    else if (action === 'match') {
      const prompt = `Match Resume vs JD. JD: ${payload.jd.substring(0, 4000)}. RESUME: ${payload.resume.substring(0, 10000)}. Output JSON: { "matchedCoreKeywords": [], "missingCoreKeywords": [], "matchFeedback": "", "matchPercentage": 0 }`;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}

