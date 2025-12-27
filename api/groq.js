import Groq from 'groq-sdk';

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
    return { error: "Failed to parse JSON" };
  }
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
// 🧠 Logic: Strict Word Controller (500-700 Limit)
// ==========================================
async function handleSmartBulkImprove(sections) {
  // 1. حساب الكلمات الحالية
  const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
  
  // 2. تحديد الهدف والاستراتيجية (بناءً على مشكلة الـ 1500 كلمة)
  let targetTotalWords = 600; // الهدف الذهبي
  let strategy = "OPTIMIZE";

  if (currentTotalWords < 300) { 
    // توسيع بحذر
    targetTotalWords = 600; 
    strategy = "EXPAND slightly. Focus on quality not quantity."; 
  } 
  else if (currentTotalWords > 750) { 
    // كبح جماح الموديل إذا النص طويل أصلاً
    targetTotalWords = 700; 
    strategy = "CONDENSE significantly. Remove fluff. Be concise."; 
  }

  // 3. توزيع الأوزان (السيطرة على حجم الأقسام)
  const weights = { 
    'experience': 0.60, 
    'projects': 0.15, 
    'summary': 0.10, 
    'education': 0.10, 
    'skills': 0.05 
  };
  
  // عد الأقسام
  const typeCounts = { 'experience': 0, 'projects': 0, 'summary': 0, 'education': 0, 'skills': 0, 'other': 0 };
  sections.forEach(s => {
      const t = s.title.toLowerCase();
      if (t.includes('experience') || t.includes('work')) typeCounts['experience']++;
      else if (t.includes('project')) typeCounts['projects']++;
      else if (t.includes('summary') || t.includes('about')) typeCounts['summary']++;
      else if (t.includes('education')) typeCounts['education']++;
      else if (t.includes('skill')) typeCounts['skills']++;
      else typeCounts['other']++;
  });

  // 4. بناء التعليمات مع "سقف" لكل قسم
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
      // الحسبة الدقيقة: الهدف الكلي * وزن القسم / عدد عناصر القسم
      let sectionTarget = Math.round(targetTotalWords * weight / count);
      
      // حدود الأمان (لا يقل عن 30 ولا يزيد عن 250 للقسم الواحد)
      if (sectionTarget < 30 && category !== 'other') sectionTarget = 40;
      if (sectionTarget > 250) sectionTarget = 250; // سقف إجباري لمنع الهلوسة

      return {
          id: s.id, 
          type: s.title, 
          content: s.content,
          instruction: `Strategy: ${strategy}. STRICT LIMIT: Maximum ${sectionTarget} words for this section. Do NOT exceed.`
      };
  });

  // 5. الـ Prompt الصارم
  const prompt = `
    ROLE: Executive Resume Writer.
    TASK: Rewrite resume sections.
    GLOBAL CONSTRAINT: Total resume MUST be approx 600 words.
    
    🚨 RULES:
    1. WORD COUNT: STRICTLY follow the "STRICT LIMIT" instruction for each section. Do NOT write long essays.
    2. LANGUAGE: DETECT input language -> OUTPUT in SAME language. DO NOT TRANSLATE.
    3. CONTENT: Use bullet points. Remove repetitive words.
    
    INPUT: ${JSON.stringify(compressedInput)}
    
    OUTPUT SCHEMA: { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.2, // تقليل الحرارة لتقليل الإبداع الزائد (الهلوسة)
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  let items = [];
  if (data.improvedSections) items = data.improvedSections;
  else if (Array.isArray(data)) items = data;
  else items = Object.values(data).find(val => Array.isArray(val)) || [];

  const mapping = {};
  items.forEach(item => { if (item.id) mapping[item.id] = item.improvedContent; });
  return mapping;
}

// ==========================================
// 🚀 Main Handler
// ==========================================
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
    
    // ✅ 1. التحسين الشامل المضبوط (Controlled Bulk)
    else if (action === 'bulk_improve') {
       result = await handleSmartBulkImprove(payload.sections);
    }

    // ✅ 2. التحسين الفردي (Instruction Based)
    else if (action === 'improve_with_instructions') {
       const prompt = `
        You are a Professional Resume Writer.
        INPUT: "${payload.content}"
        INSTRUCTION: ${payload.instruction}
        
        RULES:
        1. Language: SAME AS INPUT. NO TRANSLATION.
        2. Length: STRICTLY follow the instruction.
        3. Format: HTML.
        
        OUTPUT JSON: { "improvedContent": "HTML String" }
      `;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    // تحسين قسم عادي
    else if (action === 'improve') {
      const prompt = `
        Rewrite section "${payload.title}". 
        Content: ${payload.content}.
        Rule: Same Language.
        Output JSON: { "professional": "string", "atsOptimized": "string" }
      `;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    // المطابقة
    else if (action === 'match') {
      const prompt = `Match Resume vs JD. JD: ${payload.jd.substring(0, 4000)}. RESUME: ${payload.resume.substring(0, 10000)}. Output JSON: { "matchedCoreKeywords": [], "missingCoreKeywords": [], "matchFeedback": "", "matchPercentage": 0 }`;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        response_format: { type: "json_object" }
      });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      
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
 
