import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// نستخدم الموديل 70b لأنه أذكى بكثير في التعامل مع JSON المعقد
// إذا كان بطيئاً جداً، يمكنك العودة لـ 8b لكن الجودة ستقل
const SMART_MODEL = "llama-3.3-70b-versatile"; 
const FAST_MODEL = "llama-3.1-8b-instant";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

// ================= Helpers =================

function safeJSON(text) {
  try {
    // تنظيف النص من علامات Markdown قبل التحويل
    let t = text.replace(/```json|```/g, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a !== -1 && b !== -1) t = t.substring(a, b + 1);
    return JSON.parse(t);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return {};
  }
}

// ✅ دالة جديدة لتنظيف البيانات وإصلاح مشكلة [object Object]
function sanitizeResumeData(data) {
  const cleanString = (str) => {
    if (!str) return "";
    // إزالة النقاط الزائدة في البداية
    return String(str).replace(/^[\s•\-\*]+/, "").trim();
  };

  return {
    language: data.language || "en",
    contactInfo: {
      fullName: cleanString(data.contactInfo?.fullName),
      jobTitle: cleanString(data.contactInfo?.jobTitle),
      location: cleanString(data.contactInfo?.location),
    },
    summary: cleanString(data.summary),
    skills: Array.isArray(data.skills) ? data.skills.map(cleanString) : [],
    experience: Array.isArray(data.experience) 
      ? data.experience.map(exp => ({
          company: cleanString(exp.company),
          role: cleanString(exp.role),
          period: cleanString(exp.period),
          // التأكد أن الإنجازات مصفوفة نصوص وليست كائنات
          achievements: Array.isArray(exp.achievements) 
            ? exp.achievements.map(a => {
                if (typeof a === 'object') return cleanString(Object.values(a).join(' '));
                return cleanString(a);
              })
            : [cleanString(exp.achievements)] // لو جاءت كنص واحد نحولها لمصفوفة
        }))
      : [],
    education: Array.isArray(data.education) 
      ? data.education.map(edu => ({
          degree: cleanString(edu.degree),
          school: cleanString(edu.school),
          year: cleanString(edu.year)
        }))
      : [],
    additionalSections: Array.isArray(data.additionalSections)
      ? data.additionalSections.map(sec => ({
          title: cleanString(sec.title),
          content: Array.isArray(sec.content) ? sec.content.map(cleanString) : [cleanString(sec.content)]
        }))
      : []
  };
}

// ================= Handler =================

export default async function handler(req, res) {
  // إعدادات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === "OPTIONS") return res.status(200).end();
  const { action, payload } = req.body || {};

  try {
    // ... (أكواد analyze و bulk_improve تبقى كما هي بدون تغيير) ...
    if (action === "analyze") {
        // ... (نفس كود analyze السابق) ...
        // للاختصار لم أكرره هنا، لكن تأكد من وجوده
        return res.status(200).json({ structuredSections: [], overallScore: 50 }); 
    }

    // ✅ التعديل الجذري هنا
    if (action === "optimize") {
      const prompt = `
        You are a Senior Executive Resume Writer.
        TASK: Rewrite this resume to be highly professional, impactful, and ATS-optimized.
        
        CRITICAL RULES:
        1. NO "object Object" errors. Ensure 'achievements' is a simple list of STRINGS.
        2. NO double bullet points (• •). Return clean text.
        3. Use Strong Action Verbs (Spearheaded, Orchestrated, Optimized).
        4. Quantify results (%, $, volumes) wherever possible.
        5. LANGUAGE: Detect input language (English or Arabic) and output in the SAME language.

        INPUT JSON STRUCTURE (Adhere Strictly):
        {
          "language": "en" | "ar",
          "contactInfo": { "fullName": "Name", "jobTitle": "Target Role", "location": "City, Country" },
          "summary": "A powerful 3-4 sentence professional summary focusing on value and expertise.",
          "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
          "experience": [
            { 
              "company": "Company Name", 
              "role": "Job Title", 
              "period": "Date Range", 
              "achievements": [
                "Action verb + Task + Result (e.g., Increased revenue by 20%...)",
                "Managed a team of..."
              ] 
            }
          ],
          "education": [{ "degree": "Degree", "school": "University", "year": "Year" }],
          "additionalSections": [{ "title": "Certifications", "content": ["Cert 1", "Cert 2"] }]
        }

        RESUME TEXT TO PROCESS:
        "${payload.text.substring(0, 15000)}"
      `;

      const r = await groq.chat.completions.create({
        model: SMART_MODEL, // استخدام الموديل الأذكى لضمان التنسيق
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3, // تقليل العشوائية
        response_format: { type: "json_object" },
      });

      const rawData = safeJSON(r.choices[0]?.message?.content || "");
      
      // ✅ تنظيف البيانات قبل إرسالها للواجهة
      const cleanData = sanitizeResumeData(rawData);
      
      return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(200).json({ error: true, message: "Server processing failed" });
  }
}
