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
// 🧠 Logic: The User's Super Prompt Handler
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  // 1. حساب الطول الحالي لتوجيه الموديل
  const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
  
  // دمجنا شرط الطول مع الـ Prompt الخاص بك
  let lengthConstraint = "";
  if (currentTotalWords < 350) {
      lengthConstraint = "Note: The input is short. You MUST EXPAND on the responsibilities and achievements (using industry standards for these roles) to reach a total of 500-700 words.";
  } else if (currentTotalWords > 800) {
      lengthConstraint = "Note: The input is too long. Condense strictly to fit within 500-700 words.";
  } else {
      lengthConstraint = "Maintain the current length logic (approx 500-700 words).";
  }

  // 2. الـ Prompt الخاص بك (مع تعديلات تقنية طفيفة للمخرجات)
  const prompt = `
    ROLE: You are a professional ATS resume writer and hiring expert.
    
    TASK: Extract, rewrite, and optimize the provided CV sections into a strong, clean, and ATS-compatible resume.
    
    🚨 STRICT RULES (DO NOT IGNORE):
    - Do NOT invent or add any new experience, skills, certifications, or facts (Zero Hallucination Policy).
    - Do NOT remove important information.
    - Improve wording, clarity, structure, and impact only.
    - Keep all content truthful and based strictly on the input CV.
    - LANGUAGE: Detect input language. Output in the EXACT SAME language. DO NOT TRANSLATE.
    
    PROCESS & QUALITY STANDARDS:
    1. Tone: Strong, senior-level, results-driven.
    2. Experience: Use impact-based bullet points starting with strong action verbs. Quantify achievements where possible.
    3. Formatting: NO Tables, NO Columns. Return clean HTML tags (<p>, <ul>, <li>, <strong>).
    
    ${lengthConstraint}

    INPUT SECTIONS: 
    ${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, content: s.content })))}
    
    OUTPUT REQUIREMENTS:
    - Return a JSON object mapping original IDs to improved HTML content.
    
    OUTPUT SCHEMA: 
    { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.2, // حرارة منخفضة جداً للالتزام بالقواعد الصارمة
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
    
    // 2. Bulk Improve (باستخدام الـ Prompt الخاص بك)
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
 
