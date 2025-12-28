import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.1-8b-instant';

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

// دالة التنسيق
function forceToHTML(content) {
  if (!content) return "";
  
  // التعامل مع المصفوفات
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

  // التعامل مع الكائنات (مهم جداً للبيانات الشخصية)
  if (typeof content === 'object' && content !== null) {
    // إذا كانت بيانات شخصية، نضعها في سطر واحد أو أسطر متتالية
    return Object.entries(content)
      .map(([key, value]) => {
          if (key === 'id') return '';
          // تنظيف المفتاح (firstName -> First Name)
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
  // (نفس منطق السكور...)
  const metrics = data?.metrics || {};
  return 50; // اختصاراً للرد
}

// ==========================================
// 🧠 Logic
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  const promises = sections.map(async (section) => {
      
      const titleLower = section.title.toLowerCase();
      let formattingRule = "";
      
      // ✅ تخصيص التنسيق ليشمل البيانات الشخصية
      if (titleLower.includes('personal') || titleLower.includes('contact') || titleLower.includes('info')) {
          formattingRule = "OUTPUT MUST be formatted as compact HTML lines (e.g., <p><strong>Name:</strong> ...<br><strong>Email:</strong> ...</p>). Do not use bullet points.";
      } else if (titleLower.includes('summary') || titleLower.includes('profile')) {
          formattingRule = "OUTPUT MUST be a single HTML paragraph <p>...</p>.";
      } else if (titleLower.includes('experience') || titleLower.includes('work') || titleLower.includes('skill')) {
          formattingRule = "OUTPUT MUST be an HTML list <ul><li>...</li></ul>.";
      } else {
          formattingRule = "Use appropriate HTML tags.";
      }

      const prompt = `
        ROLE: HTML Content Formatter.
        INPUT DATA: "${JSON.stringify(section.content)}"
        TASK: Format input into resume HTML.
        
        🚨 RULES:
        1. **NO HALLUCINATIONS**: Keep exact facts.
        2. **FORMAT**: ${formattingRule}
        3. **LANGUAGE**: Keep input language.
        
        OUTPUT JSON: { "improvedContent": "html string" }
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: MODEL_NAME,
              temperature: 0.1,
              response_format: { type: "json_object" }
          });
          
          const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
          const finalHtml = forceToHTML(data.improvedContent || section.content);
          return { id: section.id, content: finalHtml };

      } catch (error) {
          console.error(`Error section ${section.id}:`, error);
          return { id: section.id, content: forceToHTML(section.content) }; 
      }
  });

  const results = await Promise.all(promises);
  const mapping = {};
  results.forEach(item => { mapping[item.id] = item.content; });
  return mapping;
}


export default async function handler(req, res) {
  // CORS headers...
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { action, payload } = req.body;

  try {
    let result = {};

    if (action === 'analyze') {
      // ✅ التعديل الأهم: إجبار الموديل على إنشاء قسم للمعلومات الشخصية
      const prompt = `
        ROLE: ATS Resume Parser.
        TASK: Extract resume data into structured JSON.
        
        RESUME: ${payload.text.substring(0, 20000)}
        
        🚨 CRITICAL INSTRUCTION:
        You MUST create a distinct section for "Personal Information" as the FIRST item in "structuredSections".
        It must contain: Name, Email, Phone, LinkedIn, Address.
        
        OUTPUT SCHEMA: {
          "structuredSections": [ 
            { "id": "sec_personal", "title": "Personal Information", "content": "Name: ..., Email: ..." },
            { "id": "sec_exp", "title": "Experience", "content": "..." } 
          ],
          "extractedHeadlines": ["Current Role"],
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
    
    // ... باقي الدوال (improve, match) كما هي ...
    else if (action === 'improve') {
        // ... (نفس الكود القديم)
        const prompt = `Rewrite section "${payload.title}". Content: ${payload.content}. Output JSON: { "professional": "", "atsOptimized": "" }`;
        const completion = await groq.chat.completions.create({ messages: [{ role: "user", content: prompt }], model: MODEL_NAME, response_format: { type: "json_object" } });
        result = cleanAndParseJSON(completion.choices[0]?.message?.content);
    }
    else if (action === 'match') {
        // ... (نفس الكود القديم)
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
 
