import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// نستخدم الموديل 70b لأنه الوحيد القادر على معالجة النصوص الطويلة دون نسيان
const SMART_MODEL = "llama-3.3-70b-versatile"; 
const FAST_MODEL = "llama-3.1-8b-instant";

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

// 🔥 دالة التنظيف والإنقاذ (The Savior)
// وظيفتها: استخراج النصوص مهما كانت مخفية داخل كائنات، وضمان عدم ظهور [object Object]
function sanitizeResumeData(data) {
  
  // 1. استخراج النص الصافي
  const extractText = (val) => {
    if (val === null || val === undefined) return "";
    
    if (typeof val === 'string') {
      return val.replace(/^[\s•\-\*]+/, "").trim(); // إزالة النقاط الزائدة
    }
    
    if (typeof val === 'number') return String(val);
    
    if (Array.isArray(val)) {
      return val.map(extractText).join(". ");
    }
    
    if (typeof val === 'object') {
      // تفكيك الكائن بالكامل وتحويله لنص
      return Object.values(val)
        .map(v => extractText(v))
        .filter(v => v.length > 0)
        .join(", ");
    }
    
    return String(val);
  };

  // 2. تسطيح القوائم
  const flattenList = (arr) => {
    if (!arr) return [];
    if (!Array.isArray(arr)) {
        const text = extractText(arr);
        return text ? [text] : [];
    }
    return arr.map(item => extractText(item)).filter(s => s.length > 0);
  };

  // 3. بناء الهيكل
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
    
    experience: Array.isArray(data.experience) 
      ? data.experience.map(exp => ({
          company: extractText(exp.company),
          role: extractText(exp.role),
          period: extractText(exp.period),
          achievements: flattenList(exp.achievements) 
        }))
      : [],
      
    education: Array.isArray(data.education) 
      ? data.education.map(edu => ({
          degree: extractText(edu.degree),
          school: extractText(edu.school),
          year: extractText(edu.year)
        }))
      : [],
      
    // ✅ هنا التغيير: نضمن أن الأقسام الإضافية موجودة
    additionalSections: Array.isArray(data.additionalSections)
      ? data.additionalSections.map(sec => ({
          title: extractText(sec.title), // تأكد أن العنوان نص
          content: flattenList(sec.content) // المحتوى قائمة نصوص
        }))
      : []
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
    // 1. Analyze (سريع)
    if (action === "analyze") {
      const prompt = `ROLE: Resume Parser. TEXT: ${payload.text.substring(0, 15000)}. OUTPUT JSON: { "structuredSections": [] }`;
      const r = await groq.chat.completions.create({ model: FAST_MODEL, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } });
      const data = safeJSON(r.choices[0]?.message?.content || "");
      return res.status(200).json({ structuredSections: data.structuredSections || [], overallScore: 50 });
    }

    // 2. Bulk Improve
    if (action === "bulk_improve") {
      return res.status(200).json({});
    }

    // 3. ✅ Optimize (الحل النهائي لمشكلة فقدان الأقسام)
    if (action === "optimize") {
        const prompt = `
        You are a Meticulous Resume Architect.
        
        INPUT TEXT:
        "${payload.text.substring(0, 30000)}"

        🔴 CRITICAL MISSION: **CAPTURE EVERY SINGLE SECTION**.
        
        Scan the text for ANY header that looks like:
        - "Training" / "Courses" / "Workshops"
        - "Languages"
        - "Certifications" / "Accreditations"
        - "Projects"
        - "Volunteering"
        - "Awards" / "Honors"
        - "Memberships"
        
        👉 **RULE**: If you find ANY of these, you MUST create a specific entry in the 'additionalSections' array. DO NOT SKIP THEM.
        👉 **RULE**: Do NOT return [object Object]. All arrays must contain simple STRINGS.
        👉 **RULE**: Move "Achievements" into the relevant Experience role.

        STRICT JSON OUTPUT:
        {
          "language": "en" | "ar",
          "contactInfo": { 
             "fullName": "String", "jobTitle": "String", "location": "String",
             "email": "String", "phone": "String", "linkedin": "String"
          },
          "summary": "String",
          "skills": ["String", "String"],
          "experience": [
            { "company": "String", "role": "String", "period": "String", "achievements": ["String", "String"] }
          ],
          "education": [{ "degree": "String", "school": "String", "year": "String" }],
          "additionalSections": [
            { "title": "Languages", "content": ["Arabic - Native", "English - Professional"] },
            { "title": "Training & Courses", "content": ["Course Name (Date)", "Another Course"] },
            { "title": "Certifications", "content": ["Cert Name (Date)"] }
            // Add MORE objects here for every other section found!
          ]
        }
        `;

        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2, // رفعنا الحرارة قليلاً ليصبح أكثر إبداعاً في التقاط الأقسام غير التقليدية
            max_tokens: 7000, 
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
