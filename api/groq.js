
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

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
      // تنظيف الرموز
      text = text.replace(/^[\s\*\-\•\·]+/, '').trim();
      return `<li>${text}</li>`;
    }).join('');
    return `<ul>${listItems}</ul>`;
  }

  if (typeof content === 'object' && content !== null) {
    return Object.entries(content)
      .map(([key, value]) => {
          if (key === 'id') return '';
          const niceKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return `<div style="margin-bottom: 3px;"><strong>${niceKey}:</strong> ${String(value)}</div>`;
      })
      .join('');
  }

  let strContent = String(content);
  strContent = strContent.replace(/^[\s\*\-\•\·]+/, '').trim();
  return strContent;
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

function calculateATSScore(data) { return 75; }

// ==========================================
// 🧠 Logic: Smart Expansion
// ==========================================
async function handleUnifiedATSImprove(sections) {
  
  const promises = sections.map(async (section) => {
      const titleLower = section.title.toLowerCase();
      
      let formattingRule = "";
      let taskInstruction = "Rewrite to be professional and clear."; // التعليمات الافتراضية

      // 1. تخصيص التنسيق (Format)
      if (titleLower.includes('personal') || titleLower.includes('contact')) {
          formattingRule = "Return a JSON Object matching input keys.";
      } else if (titleLower.includes('summary')) {
          formattingRule = "Return a single HTML paragraph <p>...</p>.";
          // للملخص: اطلب منه أن يكون مفصلاً
          taskInstruction = "Rewrite into a strong, comprehensive professional summary (approx 3-4 sentences). Highlight key years of experience and core competencies.";
      } else if (titleLower.includes('experience') || titleLower.includes('work')) {
          formattingRule = "Return a clean Array of strings. Do NOT use markdown symbols.";
          // 🔥 للخبرة: الأمر الحاسم للتطويل وعدم الاختصار
          taskInstruction = "EXPAND on the responsibilities. Do NOT summarize. Use the STAR method (Situation, Task, Action, Result) to add depth. Ensure each role has at least 4-6 detailed bullet points. Keep all specific numbers and metrics.";
      } else if (titleLower.includes('skill')) {
          formattingRule = "Return a clean Array of strings.";
          taskInstruction = "List technical and soft skills clearly.";
      } else {
          formattingRule = "Return clean HTML strings.";
      }

      const prompt = `
        ROLE: Senior ATS Resume Writer.
        INPUT CONTENT: "${JSON.stringify(section.content)}"
        
        TASK: ${taskInstruction}
        
        RULES:
        1. **FACTS**: Keep exact companies, dates, and job titles. Do NOT invent new jobs.
        2. **LENGTH**: Do NOT shorten the content. Elaborate and make it sound senior-level.
        3. **FORMAT**: ${formattingRule}
        4. **LANGUAGE**: Keep exact input language.
        
        OUTPUT JSON: { "improvedContent": ... }
      `;

      try {
          const completion = await groq.chat.completions.create({
              messages: [{ role: "user", content: prompt }],
              model: IMPROVE_MODEL,
              temperature: 0.2, // رفعنا الحرارة قليلاً (0.2) للسماح ببعض الإبداع في التعبير (التطويل)
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
      const prompt = `
        ROLE: Master Resume Parser.
        TASK: Parse resume text to structured JSON.
        RESUME: ${payload.text.substring(0, 25000)}
        
        MANDATORY SECTIONS SEQUENCE:
        1. **Personal Information** (Name, Email, Phone, LinkedIn) -> ID: "sec_personal"
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
        model: ANALYZE_MODEL,
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
