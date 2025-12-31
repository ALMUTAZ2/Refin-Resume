import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.API_KEY });
const SMART_MODEL = "llama-3.3-70b-versatile"; 

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
    console.error("❌ JSON PARSING FAILED:", e); // طباعة خطأ التحليل
    return null; // نرجع null لنعرف أن هناك خطأ
  }
}

function sanitizeResumeData(data) {
  if (!data) return {}; // حماية من البيانات الفارغة

  const extractText = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val.replace(/^[\s•\-\*]+/, "").trim();
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.map(extractText).join(". ");
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
    additionalSections: Array.isArray(data.additionalSections) ? data.additionalSections.map(sec => ({
      title: extractText(sec.title),
      content: flattenList(sec.content)
    })) : []
  };
}

// ================= HANDLER =================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, payload } = req.body || {};

  try {
    if (action === "optimize") {
        
        // 🔍 1. فحص النص الواصل
        console.log("🔥 [DEBUG] Received Text Length:", payload.text?.length);
        console.log("🔥 [DEBUG] Text Preview (First 200 chars):", payload.text?.substring(0, 200));

        if (!payload.text || payload.text.length < 50) {
            console.error("❌ [ERROR] Text is too short or empty!");
            return res.status(400).json({ error: true, message: "Resume text is empty or failed to extract." });
        }

        const prompt = `
        You are a Resume Architect.
        INPUT TEXT: "${payload.text.substring(0, 30000)}"
        
        TASK: Extract all data into this JSON structure. 
        CRITICAL: Do NOT skip any section (Languages, Courses, Projects).
        
        JSON OUTPUT:
        {
          "language": "en",
          "contactInfo": { "fullName": "", "jobTitle": "", "location": "", "email": "", "phone": "" },
          "summary": "",
          "skills": [],
          "experience": [{ "company": "", "role": "", "period": "", "achievements": [] }],
          "education": [{ "degree": "", "school": "", "year": "" }],
          "additionalSections": [{ "title": "", "content": [] }]
        }
        `;

        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1, 
            max_tokens: 7000, 
            response_format: { type: "json_object" },
        });

        // 🔍 2. فحص رد الذكاء الاصطناعي الخام
        const rawResponse = r.choices[0]?.message?.content || "";
        console.log("🤖 [DEBUG] Raw AI Response Length:", rawResponse.length);
        // console.log("🤖 [DEBUG] Raw Content:", rawResponse.substring(0, 500)); // Uncomment to see content

        const rawData = safeJSON(rawResponse);
        
        if (!rawData) {
             console.error("❌ [ERROR] Failed to parse JSON from AI response");
             return res.status(500).json({ error: true, message: "AI generated invalid JSON" });
        }

        const cleanData = sanitizeResumeData(rawData);
        
        // 🔍 3. فحص البيانات النهائية قبل الإرسال
        console.log("✅ [DEBUG] Sending Clean Data. Sections found:", cleanData.additionalSections?.length);

        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("💥 [FATAL ERROR]:", error);
    return res.status(500).json({ error: true, message: error.message });
  }
}
