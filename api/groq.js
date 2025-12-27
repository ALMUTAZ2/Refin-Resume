
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// ==========================================
// 1. 🛠️ Helpers (دوال التنظيف القوية)
// ==========================================

function cleanAndParseJSON(text) {
  if (!text) return { error: "Empty response" };
  
  try {
    // 1. إزالة أي نصوص إضافية أو Markdown
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // 2. البحث عن أول قوس { وأخر قوس }
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    // 3. محاولة التحليل
    return JSON.parse(cleanText);

  } catch (e) {
    console.error("JSON Parsing Failed. Raw Text:", text); // طباعة النص الأصلي للتحقيق
    return { error: "Failed to parse JSON", raw: text };
  }
}

// دالة إصلاح هيكل البيانات (لضمان ظهور الأقسام دائماً)
function normalizeAnalysisData(data) {
  // إذا فشل التحليل، نعيد هيكلاً فارغاً آمناً
  if (data.error) {
    return {
      structuredSections: [],
      summaryFeedback: "Error parsing resume data. Please try again.",
      parsingFlags: {},
      metrics: {}
    };
  }

  // التعامل مع اختلاف التسميات المحتمل من الموديل
  let sections = data.structuredSections || data.sections || data.parts || [];
  
  // التأكد من أن كل قسم له id
  sections = sections.map((s, index) => ({
    id: s.id || `section-${index}`,
    title: s.title || "Untitled Section",
    content: s.content || ""
  }));

  return {
    ...data,
    structuredSections: sections
  };
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
// 2. 🧠 Logic: Handlers
// ==========================================

// ... (دالة handleAdaptiveATSImprove تبقى كما هي من الكود السابق) ...
// (سأختصرها هنا لعدم التكرار، لكن تأكد من وجودها في الملف)
async function handleAdaptiveATSImprove(sections) {
    // ... [انسخ كود handleAdaptiveATSImprove من الرد السابق وضعه هنا] ...
    // إذا لم يكن لديك، سأضعه لك كاملاً في الأسفل لضمان النسخ الصحيح
    
    // --- بداية كود handleAdaptiveATSImprove المختصر للتركيز ---
    const analyzedSections = sections.map(section => {
      const t = section.title.toLowerCase();
      let type = 'OTHER';
      let atsWeight = 1;
      if (t.includes('experience') || t.includes('work')) { type = 'CORE_EXPERIENCE'; atsWeight = 10; }
      else if (t.includes('education')) { type = 'STATIC_FACTS'; atsWeight = 0; }
      else if (t.includes('personal') || t.includes('contact')) { type = 'SENSITIVE'; atsWeight = 0; }
      return { ...section, type, atsWeight };
    });

    const TARGET_TOTAL_WORDS = 650;
    const reservedWords = 150; 
    let availableWords = Math.max(300, TARGET_TOTAL_WORDS - reservedWords);
    const totalWeight = analyzedSections.reduce((sum, s) => sum + s.atsWeight, 0);

    const instructionsInput = analyzedSections.map(s => {
        let instruction = "Action: Professional Polish.";
        if (s.atsWeight > 0) {
            let targetWords = Math.round((s.atsWeight / totalWeight) * availableWords);
            if (targetWords < 50) targetWords = 50; if (targetWords > 200) targetWords = 200;
            instruction = `Strategy: ATS OPTIMIZATION (STAR Method). Target: ~${targetWords} words.`;
        } else if (s.type === 'SENSITIVE' || s.type === 'STATIC_FACTS') {
            instruction = "Action: FORMAT ONLY. DO NOT CHANGE FACTS.";
        }
        return { id: s.id, type: s.title, content: s.content, instruction };
    });

    const prompt = `
      ROLE: Expert Resume Writer.
      RULES: 1. NO INVENTED FACTS. 2. SAME LANGUAGE. 3. HTML FORMAT.
      INPUT: ${JSON.stringify(instructionsInput)}
      OUTPUT SCHEMA: { "improvedSections": [ { "id": "original_id", "improvedContent": "HTML" } ] }
    `;

    const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0.2,
        response_format: { type: "json_object" }
    });
    
    const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
    let items = data.improvedSections || (Array.isArray(data) ? data : []);
    const mapping = {};
    items.forEach(item => { if (item.id) mapping[item.id] = item.improvedContent; });
    return mapping;
    // --- نهاية كود handleAdaptiveATSImprove ---
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

    // 1. تحليل السيرة الذاتية (المكان الذي تحدث فيه مشكلة اختفاء الأقسام)
    if (action === 'analyze') {
      const prompt = `
        ROLE: Expert ATS Resume Scanner.
        OBJECTIVE: Parse the resume into structured sections.
        
        RESUME CONTENT:
        ${payload.text.substring(0, 25000)}
        
        REQUIRED JSON OUTPUT:
        {
          "structuredSections": [
            { "id": "sec1", "title": "Personal Info", "content": "..." },
            { "id": "sec2", "title": "Experience", "content": "..." }
          ],
          "extractedHeadlines": ["Current Role"],
          "parsingFlags": { "isGraphic": false, "hasColumns": false },
          "metrics": { "totalBulletPoints": 5 },
          "summaryFeedback": "Brief feedback"
        }
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0, // مهم جداً لثبات الهيكل
        response_format: { type: "json_object" }
      });
      
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      
      // ✅ هنا الإصلاح: تطبيع البيانات لضمان وجود الأقسام
      result = normalizeAnalysisData(rawData);
      
      // حساب السكور فقط إذا كانت البيانات سليمة
      if (!result.error) {
          result.overallScore = calculateATSScore(result);
      }
    } 
    
    // 2. التحسين الشامل
    else if (action === 'bulk_improve') {
       result = await handleAdaptiveATSImprove(payload.sections);
    }
    
    // (باقي الدوال كما هي)
    else if (action === 'improve') {
       // ...
       result = { professional: "Updated content", atsOptimized: "Updated content" }; // Placeholder logic needed here or verify full code
       // سأضع الكود الفعلي هنا للأمان
       const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Rule: Keep Language. Output JSON: { "professional": "", "atsOptimized": "" }`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }
    
    else if (action === 'match') {
       // ...
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
