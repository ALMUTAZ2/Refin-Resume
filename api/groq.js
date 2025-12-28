import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// نستخدم الموديل السريع لتفادي انقطاع Vercel
const MODEL_NAME = 'llama-3.1-8b-instant';

// ✅ زيادة حجم البيانات المسموح به
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// ==========================================
// 🛠️ Helpers (المُنظفات)
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
    return { error: "Failed to parse JSON" };
  }
}

// 🔥 دالة التحويل الإجباري إلى HTML (لحل مشكلة object Object)
function forceToHTML(content) {
  if (!content) return "";
  
  // 1. إذا كان مصفوفة (Array) -> حولها لقائمة HTML
  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      // إذا كان العنصر كائناً (وظيفة مثلاً)
      if (typeof item === 'object' && item !== null) {
        // نجمع كل قيم الكائن في سطر واحد لتجنب ضياع البيانات
        const values = Object.values(item)
            .filter(v => v && typeof v === 'string' || typeof v === 'number')
            .join(". ");
        return `<li>${values}</li>`;
      }
      return `<li>${String(item)}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  // 2. إذا كان كائناً (Object) -> حوله لنصوص
  if (typeof content === 'object' && content !== null) {
    return Object.entries(content)
      .map(([key, value]) => {
          if (key === 'id' || key === 'type') return ''; 
          // إذا كانت القيمة مصفوفة داخل الكائن
          if (Array.isArray(value)) {
              return `<p><strong>${key}:</strong> <ul>${value.map(v => `<li>${String(v)}</li>`).join('')}</ul></p>`;
          }
          return `<p><strong>${key}:</strong> ${String(value)}</p>`;
      })
      .join('');
  }

  // 3. إذا كان نصاً عادياً
  return String(content);
}

function normalizeAnalysisData(data) {
  if (data.error || !data.structuredSections) {
      return { 
          structuredSections: [], 
          parsingFlags: {}, metrics: {}, 
          summaryFeedback: "Error analyzing resume." 
      };
  }
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
// 🧠 Logic: Parallel & Strict Processing
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  // نرسل كل قسم في طلب منفصل (Parallel) لضمان عدم الهلوسة
  const promises = sections.map(async (section) => {
      
      const prompt = `
        ROLE: HTML Content Formatter.
        
        INPUT DATA to Format:
        "${JSON.stringify(section.content)}"
        
        TASK: 
        Convert the INPUT DATA above into clean HTML format suitable for a resume.
        
        🚨 CRITICAL RULES (ZERO TOLERANCE):
        1. **DO NOT INVENT DATA**: Use ONLY the input data provided above. If the input is "Engineer at SEC", do NOT change it to "ABC Corp".
        2. **NO PLACEHOLDERS**: Do NOT write "[Course Name]" or "[Date]". Use exact input.
        3. **OUTPUT FORMAT**: Return JSON: { "improvedContent": "<ul><li>...</li></ul>" } or { "improvedContent": "<p>...</p>" }
        4. **LANGUAGE**: Keep exact same language as input.
        5. **ARRAYS**: Transform arrays into <ul><li>Item 1</li><li>Item 2</li></ul>.
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: MODEL_NAME,
              temperature: 0.1, // حرارة منخفضة جداً لمنع التأليف
              response_format: { type: "json_object" }
          });
          
          const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
          
          // نمرر الناتج عبر المصفاة للتأكد من خلوه من الأخطاء
          const finalHtml = forceToHTML(data.improvedContent || section.content);
          
          return { id: section.id, content: finalHtml };

      } catch (error) {
          console.error(`Error improving section ${section.id}:`, error);
          // في حال الخطأ، نعيد المحتوى الأصلي منسقاً
          return { id: section.id, content: forceToHTML(section.content) }; 
      }
  });

  const results = await Promise.all(promises);

  const mapping = {};
  results.forEach(item => {
      mapping[item.id] = item.content;
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
      const prompt = `
        ROLE: ATS Resume Parser.
        TASK: Extract resume data into structured JSON.
        RESUME: ${payload.text.substring(0, 20000)}
        OUTPUT SCHEMA: {
          "structuredSections": [ { "id": "s1", "title": "Experience", "content": "..." } ],
          "extractedHeadlines": ["..."],
          "parsingFlags": {},
          "metrics": {},
          "summaryFeedback": "..."
        }
      `;
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0,
        response_format: { type: "json_object" }
      });
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
      if (!rawData.error) result.overallScore = calculateATSScore(result);
    } 
    
    else if (action === 'bulk_improve') {
        result = await handleUnifiedATSImprove(payload.sections);
    }
    
    else if (action === 'improve') {
       const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Output JSON: { "professional": "", "atsOptimized": "" }`;
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

