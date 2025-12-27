import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// 1. Helpers
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

// ============================================================
// 🧠 Logic: Smart Word Count Distributor (500-700 Words)
// ============================================================
async function handleSmartBulkImprove(sections) {
  // 1. حساب عدد الكلمات الحالي
  const currentTotalWords = sections.reduce((acc, s) => acc + s.content.trim().split(/\s+/).length, 0);
  
  // 2. تحديد الهدف (Target) والاستراتيجية
  let targetTotalWords = 650; // الهدف المثالي (وسط بين 500 و 700)
  let strategy = "OPTIMIZE";

  if (currentTotalWords < 350) { 
    // إذا النص قصير جداً، نجبره على التوسع بقوة
    targetTotalWords = 650; 
    strategy = "EXPAND SIGNIFICANTLY. Use 'Star Method'. Add detailed professional descriptions. Elaborate on every point to increase word count."; 
  } 
  else if (currentTotalWords > 900) { 
    targetTotalWords = 750; 
    strategy = "CONDENSE and focus on impact."; 
  }

  // 3. توزيع الأوزان (Weights) على الأقسام
  // الخبرة تأخذ النصيب الأكبر (60%)
  const weights = { 
    'experience': 0.60, 
    'projects': 0.15, 
    'summary': 0.15, 
    'education': 0.05, 
    'skills': 0.05 
  };
  
  // حساب عدد الأقسام من كل نوع لتوزيع الحصص
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

  // بناء التعليمات لكل قسم مع تحديد عدد الكلمات المطلوب بدقة
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
      
      // معادلة التوزيع: حصة الفئة / عدد عناصرها
      let sectionTarget = Math.round(totalCategoryWords / count);
      
      // ضمان الحد الأدنى للكلمات (لا نريد أقساماً فارغة)
      if (sectionTarget < 50 && category !== 'other') sectionTarget = 70; 

      return {
          id: s.id, 
          type: s.title, 
          content: s.content,
          instruction: `Strategy: ${strategy}. TARGET LENGTH: Approximately ${sectionTarget} words. Action: Rewrite fully to meet this length.`
      };
  });

  // 4. بناء الـ Prompt
  const prompt = `
    ROLE: Executive Resume Writer.
    TASK: Rewrite ALL the following resume sections.
    GLOBAL GOAL: The final resume MUST be between 500-700 words total.
    
    🚨 LANGUAGE RULES (ZERO TOLERANCE):
    1. Detect language of EACH section individually.
    2. Output MUST match input language exactly (Arabic->Arabic, English->English).
    3. DO NOT TRANSLATE.
    
    FORMATTING RULES:
    1. Return valid HTML (<p>, <ul>, <li>, <strong>).
    2. STRICTLY FOLLOW the "TARGET LENGTH" instruction for each section to achieve the total word count.
    3. Use strong action verbs.
    
    INPUT SECTIONS: ${JSON.stringify(compressedInput)}
    
    OUTPUT SCHEMA: { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.3,
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

// 3. Main Handler
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
    
    // ✅ 1. التحسين الشامل (Bulk) - يضمن 500-700 كلمة
    else if (action === 'bulk_improve') {
       result = await handleSmartBulkImprove(payload.sections);
    }

    // ✅ 2. التحسين الفردي المتوازي (Parallel) - يلتزم بالتعليمات القادمة من الواجهة
    else if (action === 'improve_with_instructions') {
       const prompt = `
        You are a Professional Resume Writer.
        
        INPUT CONTENT: "${payload.content}"
        INSTRUCTION: ${payload.instruction} (Use this instruction to determine length).
        
        🚨 CRITICAL LANGUAGE RULES:
        1. DETECT language of "INPUT CONTENT".
        2. IF ARABIC -> OUTPUT ARABIC.
        3. IF ENGLISH -> OUTPUT ENGLISH.
        4. DO NOT TRANSLATE.
        
        FORMATTING: Return HTML string (<p>, <ul>, <li>).
        
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
    
    // تحسين قسم واحد
    else if (action === 'improve') {
      const prompt = `
        Rewrite section "${payload.title}". 
        Content: ${payload.content}.
        Rule: Detect language and keep it.
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

