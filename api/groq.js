
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

function cleanAndParseJSON(text) {
  if (!text) return {};
  try {
    let cleanText = text.replace(/```json\s*|\s*```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    return { error: "Failed to parse JSON" };
  }
}

// دالة حساب السكور (كما هي)
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

// ✅ معالج الطلب الواحد الشامل
async function handleBulkImprove(sections) {
  // 1. حساب الكلمات الكلي
  const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
  
  // 2. تحديد الهدف العام (500-700 كلمة)
  let targetTotalWords = 600;
  let strategy = "OPTIMIZE";

  if (currentTotalWords < 350) {
      targetTotalWords = 600;
      strategy = "EXPAND significantly. Add professional details.";
  } else if (currentTotalWords > 800) {
      targetTotalWords = 700;
      strategy = "CONDENSE significantly.";
  }

  // 3. توزيع الحصص على الأقسام
  const typeCounts = { 'experience': 0, 'projects': 0, 'summary': 0, 'education': 0, 'skills': 0, 'other': 0 };
  sections.forEach(s => {
      const t = s.title.toLowerCase();
      if (t.includes('experience') || t.includes('work')) typeCounts['experience']++;
      else if (t.includes('project')) typeCounts['projects']++;
      else if (t.includes('summary')) typeCounts['summary']++;
      else if (t.includes('education')) typeCounts['education']++;
      else if (t.includes('skill')) typeCounts['skills']++;
      else typeCounts['other']++;
  });

  const weights = { 'experience': 0.65, 'projects': 0.15, 'summary': 0.10, 'education': 0.05, 'skills': 0.05 };

  // 4. بناء التعليمات المجمعة
  const compressedInput = sections.map(s => {
      const t = s.title.toLowerCase();
      let category = 'other';
      let weight = 0;

      if (t.includes('experience') || t.includes('work')) { category = 'experience'; weight = weights.experience; }
      else if (t.includes('project')) { category = 'projects'; weight = weights.projects; }
      else if (t.includes('summary')) { category = 'summary'; weight = weights.summary; }
      else if (t.includes('education')) { category = 'education'; weight = weights.education; }
      else if (t.includes('skill')) { category = 'skills'; weight = weights.skills; }

      const count = typeCounts[category] || 1;
      const totalCategoryWords = targetTotalWords * weight;
      let sectionTarget = Math.round(totalCategoryWords / count);
      if (sectionTarget < 30 && category !== 'other') sectionTarget = 50;

      return {
          id: s.id,
          type: s.title,
          content: s.content,
          instruction: `Strategy: ${strategy}. Target Words: ~${sectionTarget}. Action: Rewrite fully.`
      };
  });

  // 5. الطلب الواحد (Single Request)
  const prompt = `
    ROLE: Executive Resume Writer.
    TASK: Rewrite ALL the following resume sections in ONE go.
    
    🚨 LANGUAGE RULES (STRICT):
    1. Detect language of EACH section individually.
    2. Output MUST match input language exactly (Arabic->Arabic, English->English).
    3. DO NOT TRANSLATE.
    
    FORMATTING:
    1. Return valid HTML (<p>, <ul>, <li>).
    2. Respect the target word count for each section.
    
    INPUT: ${JSON.stringify(compressedInput)}
    
    OUTPUT SCHEMA:
    { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    if (action === 'analyze') {
       const prompt = `ROLE: ATS Scanner. RESUME: ${payload.text.substring(0, 25000)}. OUTPUT JSON ONLY...`; // (استخدم الـ Prompt الكامل السابق هنا)
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
       result.overallScore = calculateATSScore(result);
    } 
    
    else if (action === 'bulk_improve') {
      // ✅ استدعاء دالة الطلب الواحد
      result = await handleBulkImprove(payload.sections);
    }
    
    else if (action === 'improve') {
       const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Rule: Keep Language. Output JSON: { "professional": "", "atsOptimized": "" }`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    else if (action === 'match') {
       const prompt = `Match Resume vs JD. JD: ${payload.jd}. Resume: ${payload.resume}. Output JSON...`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}
