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

// 2. Main Handler
export default async function handler(req, res) {
  // CORS Headers
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
    
    // ✅ التحسين السريع (Parallel) مع حماية اللغة الصارمة
    else if (action === 'improve_with_instructions') {
       const prompt = `
        You are a Professional Resume Writer.
        
        INPUT CONTENT: "${payload.content}"
        INSTRUCTION: ${payload.instruction}
        
        🚨 CRITICAL LANGUAGE RULES (MUST FOLLOW):
        1. IGNORE the language of the instruction (which is English).
        2. DETECT the language of the "INPUT CONTENT" only.
        3. IF INPUT IS ARABIC -> OUTPUT MUST BE ARABIC.
        4. IF INPUT IS ENGLISH -> OUTPUT MUST BE ENGLISH.
        5. DO NOT TRANSLATE UNDER ANY CIRCUMSTANCES.
        
        FORMATTING RULES:
        1. Return HTML string (<p>, <ul>, <li>, <strong>).
        2. Expand and improve professionally.
        
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
    
    // تحسين قسم واحد (يدوي)
    else if (action === 'improve') {
      const prompt = `
        Rewrite section "${payload.title}". 
        Content: ${payload.content}.
        Rule: Detect language and keep it (Arabic->Arabic, English->English).
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
      
      // إعادة حساب النسبة
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

