import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
  // timeout: 60000, // ملاحظة: Vercel سيقطع عند 10 ثواني مهما وضعت هنا، لكن لا بأس بتركها
});

const FAST_MODEL = "llama-3.1-8b-instant";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

// ================= Helpers =================

function countWords(str = "") {
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().split(" ").length;
}

function safeJSON(text) {
  try {
    let t = text.replace(/```json|```/g, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b !== -1) t = t.substring(a, b + 1);
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function forceToHTML(content) {
  if (!content) return "";
  
  if (Array.isArray(content)) {
    return `<ul>${content.map(v => {
        // تنظيف: إزالة النجوم أو الشرطات من بداية النص
        let text = String(v).replace(/^[\s\*\-\•\·]+/, '').trim();
        return `<li>${text}</li>`;
    }).join("")}</ul>`;
  }
  
  if (typeof content === "object") {
    return Object.entries(content)
      .map(([k, v]) => `<div><strong>${k.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${v}</div>`)
      .join("");
  }
  
  // تنظيف النصوص العادية
  return String(content).replace(/^[\s\*\-\•\·]+/, '').trim();
}

// ================= CORE =================

async function improveSectionsSafe(sections) {
  const TARGET = 650;
  const total = sections.reduce((s, x) => s + countWords(x.content), 0) || 1;

  // ⚡ نصيحة: إذا واجهت Timeout في Vercel، ارفع هذا الرقم إلى 4 أو 5
  // الرقم 2 آمن لـ Groq لكنه قد يكون بطيئاً قليلاً لـ Vercel
  const CONCURRENCY = 3; 
  const output = [];

  async function process(section) {
    const ratio = countWords(section.content) / total;
    let target = Math.round(ratio * TARGET);

    const t = section.title.toLowerCase();
    
    // قواعد الحد الأدنى
    if ((t.includes("experience") || t.includes("project")) && target < 200) target = 200;
    if (t.includes("summary") && target < 80) target = 80;

    // 🔥 الـ Prompt القوي (سر الطول والاحترافية)
    let strategy = `Target length: ~${target} words.`;
    let formatting = "Clean HTML strings.";

    if (t.includes('experience') || t.includes('project')) {
        formatting = "HTML List <ul><li>...";
        strategy = `EXTREME EXPANSION. Use STAR method. Write 5-8 detailed bullets per role. Do NOT summarize. Aim for ${target} words.`;
    } else if (t.includes('summary')) {
        formatting = "HTML Paragraph <p>...";
        strategy = `Write a comprehensive executive summary (${target} words).`;
    } else if (t.includes('personal')) {
        formatting = "JSON Object.";
    }

    const prompt = `
      ROLE: Expert ATS Resume Writer
      TASK: Rewrite & Expand
      GOAL: ${strategy}
      
      RULES:
      - Keep facts exact (Dates, Companies).
      - Use strong action verbs.
      - FORMAT: ${formatting}
      - LANGUAGE: Same as input.

      INPUT:
      ${JSON.stringify(section.content).substring(0, 6000)}

      OUTPUT JSON: { "improvedContent": ... }
    `;

    try {
      const r = await groq.chat.completions.create({
        model: FAST_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const data = safeJSON(r.choices[0]?.message?.content || "");
      return { id: section.id, content: forceToHTML(data.improvedContent || section.content) };
    } catch {
      return { id: section.id, content: forceToHTML(section.content) };
    }
  }

  // نظام الدفعات (Batch Processing)
  for (let i = 0; i < sections.length; i += CONCURRENCY) {
    const batch = sections.slice(i, i + CONCURRENCY);
    const res = await Promise.all(batch.map(process));
    output.push(...res);
  }

  return Object.fromEntries(output.map(x => [x.id, x.content]));
}

// ================= Handler =================

export default async function handler(req, res) {
  // تفعيل CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === "OPTIONS") return res.status(200).end();
  const { action, payload } = req.body || {};

  try {
    if (action === "analyze") {
      // تقليل النص لتسريع التحليل
      const prompt = `
        ROLE: Resume Parser
        TEXT: ${payload.text.substring(0, 15000)}
        
        EXTRACT SECTIONS (IDs must be exact):
        1. Personal Info (id: sec_personal)
        2. Summary (id: sec_summary)
        3. Experience (id: sec_exp)
        4. Education (id: sec_edu)
        5. Skills (id: sec_skills)
        6. Projects (id: sec_projects)
        7. Languages (id: sec_lang)
        
        OUTPUT JSON: { "structuredSections": [{ "id": "...", "title": "...", "content": "..." }] }
      `;

      const r = await groq.chat.completions.create({
        model: FAST_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const data = safeJSON(r.choices[0]?.message?.content || "");
      return res.status(200).json({
        structuredSections: data.structuredSections || [],
        overallScore: 50,
      });
    }

    if (action === "bulk_improve") {
      const result = await improveSectionsSafe(payload.sections);
      return res.status(200).json(result);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    // إرجاع رد "ناعم" بدلاً من 500
    return res.status(200).json({ error: true, structuredSections: [] });
  }
}

