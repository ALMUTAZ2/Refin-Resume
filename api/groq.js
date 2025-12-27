import Groq from 'groq-sdk';

// 1. إعداد الاتصال الآمن (يحدث داخل سيرفرات فيرسل فقط)
const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// ==========================================
// 🛠️ Helpers (نقلنا دوال المساعدة هنا)
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
    return { error: "Failed to parse JSON" };
  }
}

// ✅ نقلنا منطق حساب السكور المعقد هنا
function calculateATSScore(data) {
  const flags = data?.parsingFlags || {};
  if (flags.isGraphic || flags.hasColumns || flags.hasTables) return 35; 

  let penalty = 0;
  if (!flags.hasStandardSectionHeaders) penalty += 20; 
  if (flags.contactInfoInHeader) penalty += 15;

  const metrics = data?.metrics || {};
  const totalBullets = Math.max(metrics.totalBulletPoints || 1, 1);
  const bulletsWithNumbers = metrics.bulletsWithMetrics || 0;
  
  const metricsRatio = Math.min(bulletsWithNumbers / totalBullets, 0.4) / 0.4; 
  const impactScore = metricsRatio * 40;

  const hardSkillsCount = data?.hardSkillsFound?.length || 0;
  const skillsScore = Math.min(hardSkillsCount, 8) / 8 * 30;

  const sections = data?.structuredSections?.map((s) => s.title.toLowerCase()) || [];
  let structurePoints = 0;
  if (sections.some((s) => s.includes('experience') || s.includes('work'))) structurePoints += 5;
  if (sections.some((s) => s.includes('education'))) structurePoints += 5;
  if (sections.some((s) => s.includes('skill'))) structurePoints += 5;
  if (sections.length >= 4) structurePoints += 5;
  
  const minorIssues = (data?.formattingIssues?.length || 0);
  const formattingScore = Math.max(0, 10 - (minorIssues * 2));

  const rawScore = impactScore + skillsScore + structurePoints + formattingScore;
  return Math.round(Math.max(10, Math.min(100, rawScore - penalty)));
}

// ✅ نقلنا منطق "Elastic Optimization" الذكي هنا
async function handleBulkImprove(sections) {
  // 1. حساب الكلمات
  const currentTotalWords = sections.reduce((acc, section) => acc + section.content.trim().split(/\s+/).length, 0);
  
  // 2. تحديد الاستراتيجية (نفس منطق الكود الخاص بك)
  let targetWords = currentTotalWords;
  let strategy = "OPTIMIZE";

  if (currentTotalWords < 500) { 
    targetWords = 550; // زيادة قليلة لضمان التوسع
    strategy = "EXPAND significantly. Add details and professional fluff."; 
  } 
  else if (currentTotalWords > 700) { 
    targetWords = 680; 
    strategy = "CONDENSE"; 
  }

  // 3. توزيع الأوزان
  const weights = { 'experience': 0.65, 'projects': 0.15, 'summary': 0.10, 'education': 0.05, 'skills': 0.05 };

  const compressedInput = sections.map(s => {
    const type = s.title.toLowerCase();
    let weight = weights['experience'] || 0.65; 
    if (type.includes('summary')) weight = weights['summary'];
    else if (type.includes('project')) weight = weights['projects'];
    else if (type.includes('education')) weight = weights['education'];
    else if (type.includes('skill')) weight = weights['skills'];

    const sectionTarget = Math.round(targetWords * weight);
    
    return { 
      id: s.id, 
      type: s.title, 
      content: s.content, 
      instruction: `Strategy: ${strategy}. Target Words: ~${sectionTarget}. Action: Rewrite professionally.` 
    };
  });

  const prompt = `
    ROLE: Expert Resume Writer.
    GLOBAL GOAL: Improve ATS readability.
    STRATEGY: ${strategy} (Aim for ${targetWords} words).
    
    CRITICAL RULES:
    1. DO NOT SUMMARIZE. Rewrite full content.
    2. MAINTAIN DETAILS: Keep numbers and dates.
    3. FORMAT: Use HTML tags (<ul>, <li>, <p>).
    4. LANGUAGE: If input is Arabic, output MUST be Arabic.
    
    INPUT: ${JSON.stringify(compressedInput)}
    
    OUTPUT SCHEMA:
    [ { "id": "original_id", "improvedContent": "<p>Content...</p>" } ]
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.3, 
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  // استخراج البيانات وتنسيقها
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (data.improvedSections) items = data.improvedSections;
  else items = Object.values(data).find(val => Array.isArray(val)) || [];

  const mapping = {};
  items.forEach(item => {
    if (item.id && item.improvedContent) mapping[item.id] = item.improvedContent;
  });

  return mapping;
}


// ==========================================
// 🚀 Main Handler (نقطة الدخول)
// ==========================================
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result;

    // 1. تحليل السيرة (مع السكور)
    if (action === 'analyze') {
      const prompt = `
        ROLE: Elite ATS Resume Parser.
        OBJECTIVE: Extract structural data strictly.
        RULES: NO INFERENCE. BOOLEAN FLAGS ONLY.
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
      // ✅ حساب السكور يتم الآن في السيرفر
      result.overallScore = calculateATSScore(result);
    } 
    
    // 2. التحسين الشامل (بالذكاء الكامل)
    else if (action === 'bulk_improve') {
      result = await handleBulkImprove(payload.sections);
    }
    
    // 3. تحسين قسم
    else if (action === 'improve') {
      const prompt = `Rewrite section "${payload.title}". Tone: Executive. Content: ${payload.content}. Output JSON: { "professional": "string", "atsOptimized": "string" }`;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    // 4. المطابقة (مع الحسابات)
    else if (action === 'match') {
      const prompt = `Match Resume vs JD. JD: ${payload.jd.substring(0, 4000)}. RESUME: ${payload.resume.substring(0, 10000)}. Output JSON: { "matchedCoreKeywords": [], "missingCoreKeywords": [], "matchFeedback": "", "matchPercentage": 0 }`;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      
      // إعادة حساب النسبة المئوية في السيرفر لضمان الدقة
      const coreMatch = result.matchedCoreKeywords?.length || 0;
      const coreMissing = result.missingCoreKeywords?.length || 0;
      const secMatch = result.matchedSecondaryKeywords?.length || 0;
      const secMissing = result.missingSecondaryKeywords?.length || 0;
      const totalWeighted = ((coreMatch + coreMissing) * 3) + (secMatch + secMissing);
      const earnedWeighted = (coreMatch * 3) + secMatch;
      result.matchPercentage = totalWeighted > 0 ? Math.round((earnedWeighted / totalWeighted) * 100) : 0;
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}

