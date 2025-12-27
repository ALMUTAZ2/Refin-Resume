import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// ==========================================
// 1. 🛠️ Helpers
// ==========================================
function cleanAndParseJSON(text) {
  if (!text) return { error: "Empty response" };
  try {
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    return { error: "Failed to parse JSON", raw: text };
  }
}

function normalizeAnalysisData(data) {
  if (data.error) return { structuredSections: [], parsingFlags: {}, metrics: {} };
  let sections = data.structuredSections || data.sections || [];
  sections = sections.map((s, index) => ({
    id: s.id || `section-${index}`,
    title: s.title || "Untitled Section",
    content: s.content || ""
  }));
  return { ...data, structuredSections: sections };
}

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
  const sections = data?.structuredSections?.map((s) => s.title.toLowerCase()) || [];
  let structurePoints = 0;
  if (sections.some((s) => s.includes('experience') || s.includes('work'))) structurePoints += 5;
  if (sections.some((s) => s.includes('education'))) structurePoints += 5;
  if (sections.some((s) => s.includes('skill'))) structurePoints += 5;
  const formattingScore = 10; 
  return Math.round(Math.min(100, impactScore + structurePoints + formattingScore - penalty));
}

// ==========================================
// 🧠 Logic: Unified Prompt + Length Controller
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  // 1. حساب الطول الحالي لتحديد الاستراتيجية
  const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
  
  let lengthInstruction = "";
  
  // إذا كان النص قصيراً (أقل من 350 كلمة)، نطلب التوسع بقوة للوصول لـ 600
  if (currentTotalWords < 350) {
      lengthInstruction = `
      CRITICAL LENGTH REQUIREMENT: The current resume is too short (${currentTotalWords} words). 
      You MUST EXPAND the content to reach a TOTAL of 500-700 words.
      HOW TO EXPAND:
      - Elaborate heavily on "Experience" and "Projects" sections using the Job Title context.
      - Add professional details and standard duties for these roles.
      - Use the 'Star Method' to create detailed bullet points.
      `;
  } 
  // إذا كان النص طويلاً جداً، نطلب الاختصار
  else if (currentTotalWords > 800) {
      lengthInstruction = `
      CRITICAL LENGTH REQUIREMENT: The current resume is too long. 
      CONDENSE the content to fit within 500-700 words. Focus on impact and remove fluff.
      `;
  } 
  // إذا كان مناسباً، نحافظ عليه
  else {
      lengthInstruction = `
      LENGTH REQUIREMENT: Maintain the current length (approx 500-700 words). Focus on quality.
      `;
  }

  // 2. الـ Prompt الموحد (الخاص بك) + تعليمات الطول واللغة
  const USER_PROMPT = `Rewrite the following CV sections to be professional, clear, concise, and fully optimized for ATS systems. Ensure each section includes relevant keywords, highlights achievements, uses action verbs, and improves readability. Keep formatting simple for ATS parsing.`;

  const prompt = `
    ROLE: Expert ATS Resume Writer.
    
    CORE TASK: ${USER_PROMPT}
    
    ${lengthInstruction}
    
    🚨 STRICT EXECUTION RULES:
    1. LANGUAGE: Detect input language -> Output SAME language exactly. NO TRANSLATION.
    2. FACTUALITY: Do NOT invent degrees, dates, or companies. ONLY expand on *descriptions* of roles/skills.
    3. FORMAT: Return clean HTML strings (<p>, <ul>, <li>, <strong>).
    
    INPUT SECTIONS: 
    ${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, content: s.content })))}
    
    OUTPUT SCHEMA: 
    { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.3, // حرارة متوسطة للسماح بالتوسع دون هلوسة
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  let items = data.improvedSections || (Array.isArray(data) ? data : []);
  const mapping = {};
  items.forEach(item => { if (item.id) mapping[item.id] = item.improvedContent; });
  return mapping;
}

// ==========================================
// 3. Main Handler
// ==========================================
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    // 1. Analyze
    if (action === 'analyze') {
      const prompt = `ROLE: ATS Scanner. Parse resume to structured JSON. RESUME: ${payload.text.substring(0, 25000)}. OUTPUT: { structuredSections: [{id, title, content}], ... }`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, temperature: 0, response_format: { type: "json_object" } });
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
      if (!result.error) result.overallScore = calculateATSScore(result);
    } 
    
    // 2. Bulk Improve (Unified + Length Control)
    else if (action === 'bulk_improve') {
       result = await handleUnifiedATSImprove(payload.sections);
    }
    
    // 3. Improve Single Section
    else if (action === 'improve') {
       const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Keep Language. Output JSON: { "professional": "", "atsOptimized": "" }`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }
    
    // 4. Match JD
    else if (action === 'match') {
       const prompt = `Match Resume vs JD. JD: ${payload.jd}. Resume: ${payload.resume}. Output JSON...`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}

