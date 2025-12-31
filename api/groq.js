import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// نستخدم أقوى موديل لفهم السياق ودمج الأقسام بذكاء
const SMART_MODEL = "llama-3.3-70b-versatile"; 

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

// ================= Helpers =================

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

// ✅ دالة التنظيف العميق (لضمان عدم ظهور object Object)
function sanitizeResumeData(data) {
  const cleanString = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val.replace(/^[\s•\-\*]+/, "").trim();
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
      return Object.values(val).map(v => cleanString(v)).filter(v => v).join(". "); 
    }
    return String(val);
  };

  const cleanArray = (arr) => {
    if (!arr) return [];
    if (Array.isArray(arr)) return arr.map(cleanString).filter(s => s.length > 0);
    if (typeof arr === 'object') return Object.values(arr).map(cleanString).filter(s => s.length > 0);
    return [cleanString(arr)];
  };

  return {
    language: data.language || "en",
    contactInfo: {
      fullName: cleanString(data.contactInfo?.fullName),
      jobTitle: cleanString(data.contactInfo?.jobTitle),
      location: cleanString(data.contactInfo?.location),
    },
    summary: cleanString(data.summary),
    skills: cleanArray(data.skills),
    experience: Array.isArray(data.experience) ? data.experience.map(exp => ({
      company: cleanString(exp.company),
      role: cleanString(exp.role),
      period: cleanString(exp.period),
      achievements: cleanArray(exp.achievements) 
    })) : [],
    education: Array.isArray(data.education) ? data.education.map(edu => ({
      degree: cleanString(edu.degree),
      school: cleanString(edu.school),
      year: cleanString(edu.year)
    })) : [],
    additionalSections: Array.isArray(data.additionalSections) ? data.additionalSections.map(sec => ({
      title: cleanString(sec.title),
      content: cleanArray(sec.content)
    })) : []
  };
}

// ================= Handler =================

export default async function handler(req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, payload } = req.body || {};

  try {
    if (action === "optimize") {
        const prompt = `
        You are an Elite Executive Resume Writer & ATS Expert.
        
        INPUT TEXT:
        "${payload.text.substring(0, 25000)}"

        YOUR TASK:
        1. **INTEGRATE ACHIEVEMENTS**: The input text might have a separate "Achievements" section. You MUST move these achievements into the relevant "Experience" job entry based on context and dates. Do not leave them floating.
        2. **IMPROVE IMPACT**: Rewrite bullet points using the STAR method (Situation, Task, Action, Result). Use strong verbs (Spearheaded, Orchestrated, Optimized).
        3. **QUANTIFY**: Highlight numbers (SAR 800M, 98%, 25 MVA) in bold or near the start of the bullet.
        4. **SUMMARY**: Write a powerful 3-4 sentence professional summary.
        
        STRICT JSON OUTPUT (No Markdown, No Objects inside arrays):
        {
          "language": "en" | "ar",
          "contactInfo": { "fullName": "String", "jobTitle": "High Level Title", "location": "String" },
          "summary": "String",
          "skills": ["String", "String", "String"],
          "experience": [
            { 
              "company": "String", 
              "role": "String", 
              "period": "String", 
              "achievements": [
                 "Strong Bullet 1 (String ONLY)",
                 "Strong Bullet 2 (String ONLY)"
              ] 
            }
          ],
          "education": [{ "degree": "String", "school": "String", "year": "String" }],
          "additionalSections": [{ "title": "Certifications / Languages", "content": ["String", "String"] }]
        }
        `;

        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2, // Low temperature for consistency
            max_tokens: 6000, 
            response_format: { type: "json_object" },
        });

        const rawData = safeJSON(r.choices[0]?.message?.content || "");
        const cleanData = sanitizeResumeData(rawData);
        
        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(200).json({ error: true, message: "Server processing failed" });
  }
}
