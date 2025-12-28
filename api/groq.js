import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// ✅ نستخدم Llama 3.3 70B (الذكي) في التحليل فقط، لأنه طلب واحد ولن يطول
// إذا واجهت Timeout في التحليل، غيره إلى 'llama-3.1-8b-instant'
// لكن 70B أفضل بكثير في استخراج الأقسام كاملة
const MODEL_NAME = 'llama-3.3-70b-versatile'; 

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// ==========================================
// 🛠️ Helpers
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

function forceToHTML(content) {
  if (!content) return "";
  
  // المصفوفات -> قوائم
  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      if (typeof item === 'object' && item !== null) {
        const values = Object.values(item)
            .filter(v => v && (typeof v === 'string' || typeof v === 'number'))
            .join(" - ");
        return `<li>${values}</li>`;
      }
      return `<li>${String(item)}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  // الكائنات -> أسطر (مهم للبيانات الشخصية)
  if (typeof content === 'object' && content !== null) {
    return Object.entries(content)
      .map(([key, value]) => {
          if (key === 'id') return '';
          const niceKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return `<div class="mb-1"><strong>${niceKey}:</strong> ${String(value)}</div>`;
      })
      .join('');
  }

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
    // منطق السكور (مختصر)
    return 60; 
}

// ==========================================
// 🧠 Logic: Parallel Improve
// ==========================================
async function handleUnifiedATSImprove(sections) {
  const promises = sections.map(async (section) => {
      const titleLower = section.title.toLowerCase();
      let formattingRule = "Use HTML tags.";
      
      if (titleLower.includes('personal') || titleLower.includes('contact')) {
          formattingRule = "Format as compact lines (Name, Email, Phone). No bullets.";
      } else if (titleLower.includes('summary')) {
          formattingRule = "Format as a single HTML paragraph <p>...</p>.";
      } else if (titleLower.includes('experience') || titleLower.includes('education') || titleLower.includes('skill')) {
          formattingRule = "Format as an HTML list <ul><li>...</li></ul>.";
      }

      const prompt = `
        ROLE: HTML Formatter.
        INPUT: "${JSON.stringify(section.content)}"
        
        RULES:
        1. Keep FACTS exactly as is.
        2. FORMAT: ${formattingRule}
        3. OUTPUT JSON: { "improvedContent": "html string" }
      `;

      try {
          // نستخدم الموديل السريع هنا (8b) لأن العدد كبير ونحتاج سرعة
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: 'llama-3.1-8b-instant', // ⚡ سرعة للمعالجة المتوازية
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
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    if (action === 'analyze') {
      // ✅ التعديل الجذري: تعليمات شاملة لاستخراج كل قسم
      const prompt = `
        ROLE: Expert Resume Parser.
        
        TASK: Parse the ENTIRE resume text below into structured sections.
        
        RESUME CONTENT: 
        ${payload.text.substring(0, 25000)}
        
        🚨 MANDATORY SECTIONS TO EXTRACT (If present):
        1. **Personal Information** (Name, Email, Phone, Location) -> MUST BE FIRST.
        2. **Professional Summary** (or Profile/About).
        3. **Experience** (Work History).
        4. **Education**.
        5. **Skills** (Technical & Soft).
        6. **Projects**.
        7. **Certifications**.
        8. **Languages**.
        9. **Any other custom headers** found in text.
        
        RULES:
        - Do NOT skip any text. Map every line to a section.
        - Capture the FULL content of each section.
        - Return valid JSON only.
        
        OUTPUT SCHEMA:
        {
          "structuredSections": [
            { "id": "sec_personal", "title": "Personal Information", "content": "..." },
            { "id": "sec_summary", "title": "Professional Summary", "content": "..." },
            { "id": "sec_exp", "title": "Experience", "content": "..." },
            { "id": "sec_edu", "title": "Education", "content": "..." },
            ... and so on for all found sections
          ],
          "extractedHeadlines": ["Current Job Title"],
          "parsingFlags": {},
          "metrics": {},
          "summaryFeedback": "..."
        }
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME, // نستخدم 70B هنا لأنه طلب واحد ويحتاج ذكاء
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
        const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: 'llama-3.1-8b-instant', response_format: { type: "json_object" } });
        result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }
    
    else if (action === 'match') {
        const prompt = `Match Resume vs JD. JD: ${payload.jd}. Resume: ${payload.resume}. Output JSON...`;
        const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: 'llama-3.1-8b-instant', response_format: { type: "json_object" } });
        result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }

    res.status(200).json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
}

