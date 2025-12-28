import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// 🧠 الاستراتيجية: 70B للتحليل (الذكاء)، 8B للتحسين (السرعة)
const ANALYZE_MODEL = 'llama-3.3-70b-versatile';
const IMPROVE_MODEL = 'llama-3.1-8b-instant';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// ==========================================
// 🛠️ Helpers (المُنظفات الذكية)
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

// 🔥 دالة التنسيق المحسنة (تزيل الرموز المزدوجة)
function forceToHTML(content) {
  if (!content) return "";
  
  // 1. التعامل مع المصفوفات (إزالة النجوم والشرطات الزائدة)
  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      let text = "";
      if (typeof item === 'object' && item !== null) {
        text = Object.values(item)
            .filter(v => v && (typeof v === 'string' || typeof v === 'number'))
            .join(" - ");
      } else {
        text = String(item);
      }
      
      // 🧹 تنظيف: إزالة أي رموز مثل * أو - في بداية السطر لأننا سنضع <li>
      text = text.replace(/^[\s\*\-\•]+/, '').trim();
      
      return `<li>${text}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  // 2. التعامل مع الكائنات (للمعلومات الشخصية)
  if (typeof content === 'object' && content !== null) {
    return Object.entries(content)
      .map(([key, value]) => {
          if (key === 'id') return '';
          const niceKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          // تنسيق أجمل للهيدر
          return `<div style="margin-bottom: 4px;"><strong>${niceKey}:</strong> ${String(value)}</div>`;
      })
      .join('');
  }

  // 3. النصوص العادية
  return String(content);
}

function normalizeAnalysisData(data) {
  if (data.error || !data.structuredSections) {
      return { structuredSections: [], parsingFlags: {}, metrics: {} };
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
    return 65; // Placeholder
}

// ==========================================
// 🧠 Logic: Parallel Improve (The Speed Engine)
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  const promises = sections.map(async (section) => {
      const titleLower = section.title.toLowerCase();
      let formattingRule = "";
      
      // تخصيص التعليمات
      if (titleLower.includes('personal') || titleLower.includes('contact')) {
          formattingRule = "Return a JSON Object matching input keys. Do NOT use bullets.";
      } else if (titleLower.includes('summary')) {
          formattingRule = "Return a single HTML paragraph <p>...</p>.";
      } else if (titleLower.includes('experience') || titleLower.includes('education') || titleLower.includes('skill') || titleLower.includes('course')) {
          formattingRule = "Return a clean Array of strings. Do NOT add '*' or '-' at the start of strings.";
      } else {
          formattingRule = "Return clean HTML strings.";
      }

      const prompt = `
        ROLE: Content Improver.
        INPUT: "${JSON.stringify(section.content)}"
        
        TASK: Rewrite to be professional.
        
        RULES:
        1. Keep FACTS exactly as is.
        2. FORMATTING: ${formattingRule}
        3. LANGUAGE: Keep exact input language.
        
        OUTPUT JSON: { "improvedContent": ... }
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: IMPROVE_MODEL, // 8B Instant (Fast)
              temperature: 0.1,
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
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    if (action === 'analyze') {
      // 🧠 استخدام العقل الكبير (70B) للتحليل الدقيق
      const prompt = `
        ROLE: Master Resume Parser.
        TASK: Parse resume text to structured JSON.
        RESUME: ${payload.text.substring(0, 25000)}
        
        MANDATORY SECTIONS SEQUENCE:
        1. **Personal Information** (Object: Name, Email, Phone, LinkedIn) -> ID: "sec_personal"
        2. **Professional Summary** -> ID: "sec_summary"
        3. **Experience** -> ID: "sec_exp"
        4. **Education** -> ID: "sec_edu"
        5. **Skills** -> ID: "sec_skills"
        6. **Training Courses** -> ID: "sec_courses"
        7. **Achievements** -> ID: "sec_achieve"
        8. **Languages** -> ID: "sec_lang"
        
        OUTPUT SCHEMA:
        {
          "structuredSections": [
            { "id": "sec_personal", "title": "Personal Information", "content": { "Name": "...", "Email": "..." } },
            { "id": "sec_exp", "title": "Experience", "content": ["Job 1", "Job 2"] }
          ],
          "extractedHeadlines": ["Title"],
          "parsingFlags": {},
          "metrics": {},
          "summaryFeedback": "..."
        }
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: ANALYZE_MODEL, // 70B Versatile
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
    
    else if (action === 'improve' || action === 'match') {
       // Legacy helpers using fast model
       const prompt = `Rewrite/Match content...`;
       const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt + JSON.stringify(payload) }], model: IMPROVE_MODEL, response_format: { type: "json_object" } });
       result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}
 
