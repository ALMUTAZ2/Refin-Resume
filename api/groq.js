import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = 'llama-3.1-8b-instant';

// ✅ 1. زيادة حد استقبال البيانات (لحل مشكلة السير الذاتية الكبيرة)
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
    // إرجاع كائن خطأ آمن بدلاً من انهيار السيرفر
    return { error: "Failed to parse JSON", raw: text };
  }
}

// دالة التنسيق الذكي (لحل مشكلة [object Object])
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
  // إذا كان هناك خطأ في التحليل، نعيد هيكلاً فارغاً آمناً
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
    content: s.content || "" // سيتم تنسيقه لاحقاً في العرض
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
// 🧠 Main Logic
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

    // 1. Analyze (تم إصلاح الـ Prompt ليكون دقيقاً جداً)
    if (action === 'analyze') {
      const prompt = `
        ROLE: Expert ATS Resume Parser.
        TASK: Extract resume data into structured JSON.
        
        RESUME CONTENT:
        ${payload.text.substring(0, 20000)}
        
        REQUIRED JSON OUTPUT SCHEMA:
        {
          "structuredSections": [
            { "id": "sec1", "title": "Personal Info", "content": "Name, Email..." },
            { "id": "sec2", "title": "Experience", "content": "Job 1..." }
          ],
          "extractedHeadlines": ["Current Title"],
          "parsingFlags": { "isGraphic": false, "hasColumns": false, "hasStandardSectionHeaders": true },
          "metrics": { "totalBulletPoints": 5, "bulletsWithMetrics": 2 },
          "hardSkillsFound": ["Skill1", "Skill2"],
          "summaryFeedback": "Brief feedback"
        }
        
        RULE: Content should be captured accurately. Return ONLY Valid JSON.
      `;
      
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: MODEL_NAME,
        temperature: 0,
        response_format: { type: "json_object" }
      });
      
      const rawData = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");
      result = normalizeAnalysisData(rawData);
      
      // حساب السكور فقط إذا كانت البيانات سليمة
      if (!rawData.error) {
          result.overallScore = calculateATSScore(result);
      } else {
          result.overallScore = 0;
      }
    } 
    
    // 2. Bulk Improve (مع المصحح الذكي)
    else if (action === 'bulk_improve') {
        const sections = payload.sections;
        
        // حساب الطول
        const currentTotalWords = sections.reduce((acc, s) => acc + (typeof s.content === 'string' ? s.content : JSON.stringify(s.content)).split(/\s+/).length, 0);
        
        let lengthConstraint = "";
        if (currentTotalWords < 350) {
            lengthConstraint = "Input is short. EXPAND responsibilities significantly (aim for 500-700 words).";
        } else if (currentTotalWords > 800) {
            lengthConstraint = "Input is too long. CONDENSE strictly to fit 500-700 words.";
        }

        const prompt = `
            ROLE: Professional ATS Resume Writer.
            TASK: Rewrite resume sections to be ATS-optimized HTML.
            
            🚨 OUTPUT RULES:
            1. RETURN HTML STRINGS ONLY (<p>, <ul>, <li>).
            2. NO Arrays inside the content string.
            3. Experience/Skills MUST use <ul><li>...</li></ul>.
            4. ${lengthConstraint}
            5. Language: Same as input.
            
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
        
        let items = data.improvedSections || [];
        const mapping = {};
        
        items.forEach(item => { 
            if (item.id) {
                // تطبيق المصحح الذكي هنا
                mapping[item.id] = formatContentToHTML(item.improvedContent); 
            }
        });
        
        result = mapping;
    }
    
    // (باقي الدوال كما هي)
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

