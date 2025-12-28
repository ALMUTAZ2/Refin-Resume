
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

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
    console.error("JSON Parse Error:", e);
    return { error: "Failed to parse JSON" };
  }
}

function formatContentToHTML(content) {
  if (!content) return "";
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const listItems = content.map(item => {
      if (typeof item === 'object') {
        const title = item.title || item.role || item.position || item.name || "";
        const date = item.date || item.duration || "";
        const desc = item.description || item.responsibilities || item.details || "";
        let itemHtml = `<strong>${title}</strong> ${date ? `(${date})` : ""}`;
        if (Array.isArray(desc)) {
             itemHtml += `<ul>${desc.map(d => `<li>${d}</li>`).join('')}</ul>`;
        } else if (desc) {
             itemHtml += `<p>${desc}</p>`;
        }
        return `<li>${itemHtml}</li>`;
      }
      return `<li>${item}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  if (typeof content === 'object') {
    return Object.entries(content)
      .map(([key, value]) => {
         if (key === 'id' || key === 'type') return '';
         const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
         return `<div><strong>${label}:</strong> ${value}</div>`;
      })
      .join('');
  }

  return String(content);
}

function normalizeAnalysisData(data) {
  if (data.error || !data.structuredSections) {
      return { 
          structuredSections: [], 
          parsingFlags: {}, 
          metrics: {},
          summaryFeedback: "Error analyzing resume. Please try again." 
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
// 🧠 Logic: Parallel Processing Handler
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  // 1. إطلاق جميع الطلبات في نفس اللحظة (Parallel)
  const promises = sections.map(async (section) => {
      // تحديد نوع القسم لضبط التعليمات
      const t = section.title.toLowerCase();
      let instruction = "Format neatly as HTML.";
      
      if (t.includes('experience') || t.includes('work')) {
          instruction = "EXPAND responsibilities using Star Method. Use <ul><li>...</li></ul>. Aim for impact.";
      } else if (t.includes('summary')) {
          instruction = "Rewrite as a strong professional summary paragraph <p>...</p>.";
      } else if (t.includes('skill')) {
          instruction = "List as bullet points <ul><li>...</li></ul>.";
      }

      const prompt = `
        ROLE: ATS Resume Writer.
        TASK: Rewrite this SPECIFIC section.
        INPUT TITLE: "${section.title}"
        INPUT CONTENT: "${section.content}"
        
        INSTRUCTION: ${instruction}
        
        🚨 OUTPUT RULES:
        1. Return ONLY JSON: { "improvedContent": "HTML string" }
        2. NO Arrays/Objects in content. Use HTML tags (<ul>, <li>, <p>, <strong>).
        3. Language: Same as input.
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: MODEL_NAME,
              temperature: 0.2,
              response_format: { type: "json_object" }
          });
          const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
          return { id: section.id, content: formatContentToHTML(data.improvedContent || section.content) };
      } catch (error) {
          console.error(`Error improving section ${section.id}:`, error);
          return { id: section.id, content: section.content }; // في حال الفشل نعيد القسم كما هو
      }
  });

  // 2. انتظار جميع الطلبات (تأخذ وقت أطول طلب فقط، وليس مجموعهم)
  const results = await Promise.all(promises);

  // 3. تجميع النتائج
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
          "structuredSections": [ { "id": "s1", "title": "...", "content": "..." } ],
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
        // ✅ استخدام المعالجة المتوازية السريعة
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
