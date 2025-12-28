import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.API_KEY });

// نستخدم 70B للتحليل (الدقة) و 8B للتحسين (السرعة)
const ANALYZE_MODEL = 'llama-3.3-70b-versatile';
const IMPROVE_MODEL = 'llama-3.1-8b-instant';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

// ==========================================
// 1. أدوات المساعدة (Helpers)
// ==========================================

function countWords(str) {
  if (!str) return 0;
  // حذف وسوم HTML والرموز لحساب الكلمات الصافية
  const cleanStr = String(str).replace(/<[^>]*>/g, ' ').replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
  return cleanStr.trim().split(" ").length;
}

function cleanAndParseJSON(text) {
  if (!text) return { error: "Empty response" };
  try {
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    return JSON.parse(cleanText);
  } catch (e) { return { error: "Failed to parse JSON" }; }
}

function forceToHTML(content) {
  if (!content) return "";
  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      let text = (typeof item === 'object' && item !== null) 
        ? Object.values(item).filter(v => v).join(" - ") 
        : String(item);
      text = text.replace(/^[\s\*\-\•\·]+/, '').trim();
      return `<li>${text}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }
  if (typeof content === 'object' && content !== null) {
    return Object.entries(content).map(([key, value]) => {
      if (key === 'id') return '';
      const niceKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      return `<div style="margin-bottom: 3px;"><strong>${niceKey}:</strong> ${String(value)}</div>`;
    }).join('');
  }
  return String(content).replace(/^[\s\*\-\•\·]+/, '').trim();
}

function normalizeAnalysisData(data) {
  if (data.error || !data.structuredSections) return { structuredSections: [], parsingFlags: {}, metrics: {} };
  let sections = data.structuredSections || data.sections || [];
  sections = sections.map((s, index) => ({
    id: s.id || `section-${index}`,
    title: s.title || "Untitled Section",
    content: s.content || ""
  }));
  return { ...data, structuredSections: sections };
}

// ==========================================
// 2. المنطق: التوزيع الرياضي للكلمات
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  // 1. حساب إجمالي الكلمات في الملف الأصلي
  const totalOriginalWords = sections.reduce((sum, sec) => sum + countWords(sec.content), 0) || 1;
  
  // 2. تحديد الهدف العام (مثلاً 650 كلمة ليكون في الأمان)
  const TARGET_TOTAL_WORDS = 650;

  const promises = sections.map(async (section) => {
      const sectionOriginalCount = countWords(section.content);
      
      // 3. حساب النسبة والهدف لهذا القسم
      const ratio = sectionOriginalCount / totalOriginalWords;
      let targetWordCount = Math.round(ratio * TARGET_TOTAL_WORDS);
      
      // حماية الأقسام الصغيرة جداً (لا تقل عن 40 كلمة)
      if (targetWordCount < 40) targetWordCount = 40;

      // تحديد نوع التنسيق
      const titleLower = section.title.toLowerCase();
      let formattingRule = "Clean HTML strings.";
      let contentStrategy = `Aim for approximately ${targetWordCount} words.`;

      if (titleLower.includes('personal') || titleLower.includes('contact')) {
          formattingRule = "JSON Object matching keys.";
          contentStrategy = "Keep exact contact details.";
      } else if (titleLower.includes('summary')) {
          formattingRule = "Single HTML Paragraph <p>...</p>.";
          contentStrategy = `Write a comprehensive summary of approx ${targetWordCount} words.`;
      } else if (titleLower.includes('experience') || titleLower.includes('project')) {
          formattingRule = "HTML List <ul><li>...</li></ul>.";
          contentStrategy = `EXPAND heavily. Use STAR method. Target length: ~${targetWordCount} words total for this section.`;
      } else if (titleLower.includes('skill') || titleLower.includes('courses')) {
          formattingRule = "HTML List <ul><li>...</li></ul>.";
      }

      const prompt = `
        ROLE: Expert ATS Resume Writer.
        INPUT: "${JSON.stringify(section.content)}"
        
        TASK: Rewrite and optimize this section.
        TARGET LENGTH: ${contentStrategy}
        
        RULES:
        1. **FACTS**: Do NOT invent jobs/dates.
        2. **LENGTH**: You MUST try to reach the target word count by elaborating on details (how, why, impact).
        3. **FORMAT**: ${formattingRule}
        4. **LANGUAGE**: Keep input language.
        
        OUTPUT JSON: { "improvedContent": ... }
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: IMPROVE_MODEL,
              temperature: 0.2, // قليل من الإبداع للتطويل
              response_format: { type: "json_object" }
          });
          const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
          return { id: section.id, content: forceToHTML(data.improvedContent || section.content) };
      } catch (error) {
          return { id: section.id, content: forceToHTML(section.content) }; 
      }
  });

  const results = await Promise.all(promises);
  const mapping = {};
  results.forEach(item => { mapping[item.id] = item.content; });
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
        ROLE: Master Resume Parser.
        RESUME: ${payload.text.substring(0, 25000)}
        MANDATORY SECTIONS SEQUENCE:
        1. Personal Information (ID: sec_personal)
        2. Professional Summary (ID: sec_summary)
        3. Experience (ID: sec_exp)
        4. Education (ID: sec_edu)
        5. Skills (ID: sec_skills)
        6. Projects (ID: sec_projects)
        7. Languages (ID: sec_lang)
        8. Certifications (ID: sec_cert)
        
        OUTPUT SCHEMA: { "structuredSections": [{ "id": "...", "title": "...", "content": "..." }] }
      `;
      const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: ANALYZE_MODEL, temperature: 0, response_format: { type: "json_object" } });
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
    } 
    
    else if (action === 'bulk_improve') {
        // هنا يتم تطبيق منطق توزيع الكلمات
        result = await handleUnifiedATSImprove(payload.sections);
    }
    
    else if (action === 'improve' || action === 'match') {
       const prompt = `Rewrite/Match content...`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt + JSON.stringify(payload) }], model: IMPROVE_MODEL, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
 
