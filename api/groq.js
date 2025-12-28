import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// ✅ الموديل السريع (لا يسبب Timeout)
const MODEL_NAME = 'llama-3.1-8b-instant';

// ==========================================
// 1. 🛠️ Helpers & Smart Formatter
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
    console.error("JSON Parse Error:", e);
    return { error: "Failed to parse JSON" };
  }
}

// 🔥 السحر هنا: دالة تحويل الكائنات والمصفوفات إلى HTML جميل
function formatContentToHTML(content) {
  // 1. إذا كان النص فارغاً أو نصاً عادياً، أرجعه كما هو
  if (!content) return "";
  if (typeof content === 'string') return content;

  // 2. إذا كان مصفوفة (Array) -> حولها إلى قائمة منقطة <ul>
  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      // إذا كان العنصر داخل المصفوفة كائناً (مثلاً وظيفة لها عنوان وتاريخ)
      if (typeof item === 'object') {
        const title = item.title || item.role || item.position || item.name || "";
        const date = item.date || item.duration || "";
        const desc = item.description || item.responsibilities || item.details || "";
        
        // تنسيق الوظيفة: العنوان (التاريخ) <br> التفاصيل
        let itemHtml = `<strong>${title}</strong> ${date ? `(${date})` : ""}`;
        
        // إذا التفاصيل مصفوفة أخرى
        if (Array.isArray(desc)) {
             itemHtml += `<ul>${desc.map(d => `<li>${d}</li>`).join('')}</ul>`;
        } else if (desc) {
             itemHtml += `<p>${desc}</p>`;
        }
        return `<li>${itemHtml}</li>`;
      }
      // إذا كان نصاً عادياً (مهارة مثلاً)
      return `<li>${item}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  // 3. إذا كان كائناً (Object) -> (مثل المعلومات الشخصية)
  if (typeof content === 'object') {
    return Object.entries(content)
      .map(([key, value]) => {
         // تجاهل المفاتيح غير المهمة
         if (key === 'id' || key === 'type') return '';
         // تحويل المفتاح لاسم جميل (firstName -> First Name)
         const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
         return `<div><strong>${label}:</strong> ${value}</div>`;
      })
      .join('');
  }

  return String(content);
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
    // (دالة السكور كما هي...)
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
// 🧠 Logic
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  const currentTotalWords = sections.reduce((acc, s) => acc + (typeof s.content === 'string' ? s.content : JSON.stringify(s.content)).split(/\s+/).length, 0);
  
  let lengthConstraint = "";
  if (currentTotalWords < 350) {
      lengthConstraint = "Input is short. EXPAND responsibilities significantly (aim for 500-700 words total).";
  } else if (currentTotalWords > 800) {
      lengthConstraint = "Input is too long. CONDENSE strictly to fit 500-700 words.";
  }

  const prompt = `
    ROLE: Professional ATS Resume Writer.
    
    TASK: Rewrite resume sections to be ATS-optimized HTML.
    
    🚨 OUTPUT FORMAT RULES (CRITICAL):
    1. RETURN HTML STRINGS ONLY. Do NOT return JSON objects or Arrays inside the content.
    2. USE: <ul>, <li>, <p>, <strong> tags.
    3. Experience & Skills: MUST be formatted as <ul><li>Bullet points</li></ul>.
    4. Personal Info: Format as lines <p><strong>Field:</strong> Value</p>.
    5. Language: Keep same input language.
    
    ${lengthConstraint}

    INPUT: 
    ${JSON.stringify(sections.map(s => ({ id: s.id, title: s.title, content: s.content })))}
    
    OUTPUT SCHEMA: 
    { "improvedSections": [ { "id": "input_id", "improvedContent": "HTML String" } ] }
  `;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: MODEL_NAME,
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
  
  // ✅ الخطوة الحاسمة: تنظيف وتنسيق البيانات قبل إرجاعها
  let items = data.improvedSections || [];
  const mapping = {};
  
  items.forEach(item => { 
      if (item.id) {
          // نمرر المحتوى عبر "المترجم الذكي" للتأكد أنه HTML وليس Object
          mapping[item.id] = formatContentToHTML(item.improvedContent); 
      }
  });
  
  return mapping;
}

// ==========================================
// 3. Main Handler
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
      const prompt = `ROLE: ATS Scanner. Parse resume. OUTPUT: { structuredSections: [{id, title, content}], ... }`;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, temperature: 0, response_format: { type: "json_object" } });
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
      if (!result.error) result.overallScore = calculateATSScore(result);
    } 
    
    else if (action === 'bulk_improve') {
       result = await handleUnifiedATSImprove(payload.sections);
    }
    
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

