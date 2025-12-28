import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

function cleanAndParseJSON(text) {
  if (!text) return { error: "Empty response" };
  try {
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    return JSON.parse(cleanText);
  } catch (e) {
    return { error: "Failed to parse JSON" };
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
    return Math.round(Math.min(100, impactScore + structurePoints + 10 - penalty));
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
      const prompt = `ROLE: ATS Scanner. Parse resume to structured JSON. RESUME: ${payload.text.substring(0, 25000)}. OUTPUT: { structuredSections: [{id, title, content}], ... }`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, temperature: 0, response_format: { type: "json_object" } });
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
      if (!result.error) result.overallScore = calculateATSScore(result);
    } 
    
    // ✅ العامل السريع: يعالج قسماً واحداً فقط (لتفادي الـ Timeout)
    else if (action === 'improve_section_fast') {
       const prompt = `
        ROLE: Professional ATS Resume Writer.
        
        TASK: Rewrite the following section based on the instruction.
        
        INPUT CONTENT: "${payload.content}"
        
        INSTRUCTION: ${payload.instruction}
        
        🚨 RULES:
        1. LANGUAGE: Detect input language -> Output SAME language. NO TRANSLATION.
        2. FACTS: Do not invent degrees/companies. Expand on descriptions only.
        3. FORMAT: Return valid HTML (<p>, <ul>, <li>).
        
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
    
    // Legacy support
    else if (action === 'improve') {
       const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Keep Language. Output JSON: { "professional": "", "atsOptimized": "" }`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }
    
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
 
