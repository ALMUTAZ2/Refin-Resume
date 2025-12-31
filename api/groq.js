import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.API_KEY });
// نستخدم الموديل الذكي للمهام المعقدة
const SMART_MODEL = "llama-3.3-70b-versatile"; 
const FAST_MODEL = "llama-3.1-8b-instant";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// ================= Helpers =================

function safeJSON(text) {
  try {
    let t = text.replace(/```json|```/g, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b !== -1) t = t.substring(a, b + 1);
    return JSON.parse(t);
  } catch (e) {
    console.error("❌ JSON PARSING FAILED:", e);
    return null;
  }
}

// 🔥 دالة التنظيف العميق (The Savior)
// تمنع [object Object] وتضمن استخراج النصوص من أي هيكل
function sanitizeResumeData(data) {
  if (!data) return {};

  const extractText = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val.replace(/^[\s•\-\*]+/, "").trim();
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.map(extractText).join(". ");
    // تفكيك الكائنات المتداخلة
    if (typeof val === 'object') return Object.values(val).map(v => extractText(v)).filter(v => v).join(", ");
    return String(val);
  };

  const flattenList = (arr) => {
    if (!arr) return [];
    if (!Array.isArray(arr)) { const t = extractText(arr); return t ? [t] : []; }
    return arr.map(item => extractText(item)).filter(s => s.length > 0);
  };

  return {
    language: data.language || "en",
    contactInfo: {
      fullName: extractText(data.contactInfo?.fullName),
      jobTitle: extractText(data.contactInfo?.jobTitle),
      location: extractText(data.contactInfo?.location),
      email: extractText(data.contactInfo?.email),
      phone: extractText(data.contactInfo?.phone),
      linkedin: extractText(data.contactInfo?.linkedin),
    },
    summary: extractText(data.summary),
    skills: flattenList(data.skills),
    experience: Array.isArray(data.experience) ? data.experience.map(exp => ({
      company: extractText(exp.company),
      role: extractText(exp.role),
      period: extractText(exp.period),
      achievements: flattenList(exp.achievements) 
    })) : [],
    education: Array.isArray(data.education) ? data.education.map(edu => ({
      degree: extractText(edu.degree),
      school: extractText(edu.school),
      year: extractText(edu.year)
    })) : [],
    // ✅ ضمان وجود الأقسام الإضافية
    additionalSections: Array.isArray(data.additionalSections) ? data.additionalSections.map(sec => ({
      title: extractText(sec.title),
      content: flattenList(sec.content)
    })) : []
  };
}

// ================= HANDLER =================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, payload } = req.body || {};

  try {
    // 1. Analyze
    if (action === "analyze") {
      const prompt = `ROLE: Resume Parser. TEXT: ${payload.text.substring(0, 15000)}. OUTPUT JSON: { "structuredSections": [] }`;
      const r = await groq.chat.completions.create({ model: FAST_MODEL, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } });
      const data = safeJSON(r.choices[0]?.message?.content || "");
      return res.status(200).json({ structuredSections: data.structuredSections || [], overallScore: 50 });
    }

    // 2. Bulk Improve (Legacy support)
    if (action === "bulk_improve") {
       // Keep simple or return empty if handled by optimize
       return res.status(200).json({});
    }

    // 3. ✅ Optimize (الحل الكامل)
    if (action === "optimize") {
        if (!payload.text || payload.text.length < 10) {
            return res.status(400).json({ error: true, message: "No text provided" });
        }

        const prompt = `
        You are an Elite Resume Architect.
        INPUT TEXT: "${payload.text.substring(0, 30000)}"
        
        🔴 MISSION: 
        1. Extract & Rewrite the resume to be ATS-Optimized.
        2. **CAPTURE ALL SECTIONS**: Look for Training, Languages, Certifications, Volunteering. Do NOT skip them.
        3. **FLATTEN DATA**: No nested objects in arrays. Use Strings only.
        
        STRICT JSON OUTPUT:
        {
          "language": "en" | "ar",
          "contactInfo": { "fullName": "", "jobTitle": "", "location": "", "email": "", "phone": "" },
          "summary": "Professional summary...",
          "skills": ["Skill 1", "Skill 2"],
          "experience": [{ "company": "", "role": "", "period": "", "achievements": ["Bullet 1", "Bullet 2"] }],
          "education": [{ "degree": "", "school": "", "year": "" }],
          "additionalSections": [
             { "title": "Languages", "content": ["Arabic - Native", "English - Fluent"] },
             { "title": "Certifications", "content": ["PMP - 2025"] }
          ]
        }
        `;

        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2, 
            max_tokens: 7000, 
            response_format: { type: "json_object" },
        });

        const rawData = safeJSON(r.choices[0]?.message?.content || "");
        if (!rawData) return res.status(500).json({ error: true });

        const cleanData = sanitizeResumeData(rawData);
        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: true, message: error.message });
  }
}
