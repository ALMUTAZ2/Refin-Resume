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
    if (start !== -1 && end !== -1) cleanText = cleanText.substring(start, end + 1);
    return JSON.parse(cleanText);
  } catch (e) { return { error: "Failed to parse JSON" }; }
}

function calculateATSScore(data) {
  // نفس دالة السكور السابقة تماماً
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
// 🧠 Logic: The Adaptive ATS Architect
// ==========================================
async function handleAdaptiveATSImprove(sections) {
  
  // 1. تعريف الأوزان وأنواع الأقسام (ATS Priority)
  // CORE: أهم الأقسام للـ ATS (تحتاج توسيع وكلمات مفتاحية)
  // STATIC: أقسام حقائق (ممنوع التوسع، فقط تنسيق)
  // IGNORE: معلومات حساسة (ممنوع اللمس)
  
  const analyzedSections = sections.map(section => {
      const t = section.title.toLowerCase();
      let type = 'OTHER';
      let atsWeight = 1; // الافتراضي

      if (t.includes('experience') || t.includes('work') || t.includes('history') || t.includes('employment')) {
          type = 'CORE_EXPERIENCE';
          atsWeight = 10; // أعلى أولوية
      } 
      else if (t.includes('project') || t.includes('initiative')) {
          type = 'CORE_PROJECTS';
          atsWeight = 7;
      }
      else if (t.includes('summary') || t.includes('about') || t.includes('profile')) {
          type = 'CORE_SUMMARY';
          atsWeight = 4;
      }
      else if (t.includes('education') || t.includes('academic') || t.includes('degree')) {
          type = 'STATIC_FACTS';
          atsWeight = 0; // لا نوسع التعليم
      }
      else if (t.includes('personal') || t.includes('contact') || t.includes('info')) {
          type = 'SENSITIVE';
          atsWeight = 0; // لا نوسع المعلومات الشخصية
      }
      else if (t.includes('skill') || t.includes('technolog') || t.includes('language')) {
          type = 'LISTING';
          atsWeight = 2; // مهارات تحتاج تنسيق وقليل من التوسع
      }

      return { ...section, type, atsWeight };
  });

  // 2. الحسابات الرياضية لتوزيع 600 كلمة
  const TARGET_TOTAL_WORDS = 650;
  
  // كم كلمة محجوزة للأقسام الثابتة؟ (تقدير تقريبي)
  const educationCount = analyzedSections.filter(s => s.type === 'STATIC_FACTS').length;
  const personalCount = analyzedSections.filter(s => s.type === 'SENSITIVE').length;
  const reservedWords = (educationCount * 50) + (personalCount * 30); // نحجز كلمات للأقسام التي لن نوسعها

  // كم كلمة متبقية للأقسام المهمة (الخبرة، المشاريع، الملخص)؟
  let availableWords = TARGET_TOTAL_WORDS - reservedWords;
  if (availableWords < 300) availableWords = 300; // ضمان حد أدنى

  // مجموع الأوزان للأقسام القابلة للتوسع
  const totalWeight = analyzedSections.reduce((sum, s) => sum + s.atsWeight, 0);

  // 3. بناء التعليمات لكل قسم بناءً على حصته
  const instructionsInput = analyzedSections.map(s => {
      let instruction = "";
      let targetWords = 0;

      if (s.atsWeight > 0) {
          // معادلة التوزيع العادل
          targetWords = Math.round((s.atsWeight / totalWeight) * availableWords);
          
          // حدود دنيا وعليا منطقية
          if (targetWords < 50) targetWords = 50;
          if (targetWords > 250) targetWords = 250; // سقف للقسم الواحد

          if (s.type === 'CORE_EXPERIENCE') {
              instruction = `PRIORITY: HIGH. Strategy: ATS OPTIMIZATION. Rewrite using 'STAR Method' (Situation, Task, Action, Result). Inject industry keywords. Target Length: ~${targetWords} words.`;
          } else if (s.type === 'CORE_SUMMARY') {
              instruction = `PRIORITY: MEDIUM. Strategy: IMPACTFUL PITCH. Summarize achievements. Target Length: ~${targetWords} words.`;
          } else {
              instruction = `Strategy: POLISH & FORMAT. Use standard keywords. Target Length: ~${targetWords} words.`;
          }
      } 
      else if (s.type === 'STATIC_FACTS') {
          instruction = "PRIORITY: FACTS ONLY. Action: Fix formatting and typos. DO NOT CHANGE DEGREES/DATES. DO NOT INVENT INFO.";
      } 
      else if (s.type === 'SENSITIVE') {
          instruction = "PRIORITY: CRITICAL. Action: FORMAT ONLY. KEEP EXACT DATA. DO NOT ADD OR REMOVE INFO.";
      }
      else {
          instruction = "Action: Professional clean up.";
      }

      return {
          id: s.id,
          type: s.title, // نرسل العنوان الأصلي للموديل ليفهم السياق
          content: s.content,
          instruction: instruction
      };
  });

  // 4. الإرسال للموديل (One Request)
  const prompt = `
    ROLE: Expert ATS Resume Strategist.
    TASK: Optimize the resume sections based on the specific instruction for each.
    
    🚨 GLOBAL RULES (ZERO TOLERANCE):
    1. FACTUALITY: Under NO circumstances should you invent degrees, job titles, or personal info.
    2. LANGUAGE: Detect input language -> Output SAME language. NO TRANSLATION.
    3. TONE: Professional, confident, action-oriented.
    4. FORMAT: Return valid HTML (<p>, <ul>, <li>, <strong>).
    
    INPUT SECTIONS & INSTRUCTIONS: 
    ${JSON.stringify(instructionsInput)}
    
    OUTPUT SCHEMA: 
    { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.2, // حرارة منخفضة للدقة
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  // استخراج النتائج
  let items = [];
  if (data.improvedSections) items = data.improvedSections;
  else if (Array.isArray(data)) items = data;
  else items = Object.values(data).find(val => Array.isArray(val)) || [];

  const mapping = {};
  items.forEach(item => { if (item.id) mapping[item.id] = item.improvedContent; });
  return mapping;
}

// 5. Main Handler
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
      const prompt = `ROLE: ATS Scanner. RESUME: ${payload.text.substring(0, 25000)}. OUTPUT JSON ONLY...`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result.overallScore = calculateATSScore(result);
    } 
    
    else if (action === 'bulk_improve') {
       // ✅ استدعاء الدالة المتكيفة الجديدة
       result = await handleAdaptiveATSImprove(payload.sections);
    }
    
    // (باقي الدوال كما هي)
    else if (action === 'improve') {
      const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Keep Language. Output JSON: { "professional": "", "atsOptimized": "" }`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    }
    
    else if (action === 'match') {
      const prompt = `Match Resume vs JD. JD: ${payload.jd}. Resume: ${payload.resume}. Output JSON...`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
      result = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      // حساب النسبة (يمكنك نسخ الكود السابق)
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}
 
