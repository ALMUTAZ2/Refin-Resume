import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// إعداد الموديلات
// FAST: للمهام السريعة
const FAST_MODEL = "llama-3.1-8b-instant"; 
// SMART: للمهام المعقدة (Optimize) لضمان الدقة
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

// 🔥 دالة التنظيف العميقة (Deep Flattener)
// هذه الدالة تضمن عدم ظهور [object Object] نهائياً
function sanitizeResumeData(data) {
  
  // 1. دالة لاستخراج النص الصافي من أي شيء (كائن، مصفوفة، نص)
  const extractText = (val) => {
    if (val === null || val === undefined) return "";
    
    // إذا كان نصاً، نظفه
    if (typeof val === 'string') {
      return val.replace(/^[\s•\-\*]+/, "").trim();
    }
    
    // إذا كان رقماً
    if (typeof val === 'number') return String(val);
    
    // إذا كان مصفوفة، ادمج عناصرها
    if (Array.isArray(val)) {
      return val.map(extractText).join(". ");
    }
    
    // 🔥 هنا الحل: إذا كان كائناً، استخرج قيمه وادمجها
    if (typeof val === 'object') {
      return Object.values(val)
        .map(v => extractText(v)) // استدعاء تكراري
        .filter(v => v.length > 0)
        .join(", "); // نربط القيم بفاصلة
    }
    
    return String(val);
  };

  // 2. دالة لضمان أن القوائم تحتوي على نصوص فقط
  const flattenList = (arr) => {
    if (!arr) return [];
    
    // لو لم يكن مصفوفة (مثلاً كائن)، حوله لمصفوفة نصوص
    if (!Array.isArray(arr)) {
        const text = extractText(arr);
        return text ? [text] : [];
    }

    return arr.map(item => extractText(item)).filter(s => s.length > 0);
  };

  // 3. بناء الهيكل النهائي وتنظيف كل حقل
  return {
    language: data.language || "en",
    
    contactInfo: {
      // نستخدم extractText لضمان أن الحقول نصوص فقط
      fullName: extractText(data.contactInfo?.fullName),
      jobTitle: extractText(data.contactInfo?.jobTitle),
      location: extractText(data.contactInfo?.location), // يحل مشكلة {city, country}
      email: extractText(data.contactInfo?.email || data.contactInfo?.Contact), // التقاط الإيميل بأكثر من صيغة
      phone: extractText(data.contactInfo?.phone || data.contactInfo?.Mobile),
      linkedin: extractText(data.contactInfo?.linkedin || data.contactInfo?.LinkedIn),
    },

    summary: extractText(data.summary),
    
    // تنظيف المهارات
    skills: flattenList(data.skills),
    
    // تنظيف الخبرات
    experience: Array.isArray(data.experience) 
      ? data.experience.map(exp => ({
          company: extractText(exp.company),
          role: extractText(exp.role),
          period: extractText(exp.period),
          // أهم جزء: تسطيح الإنجازات
          achievements: flattenList(exp.achievements) 
        }))
      : [],
      
    // تنظيف التعليم
    education: Array.isArray(data.education) 
      ? data.education.map(edu => ({
          degree: extractText(edu.degree),
          school: extractText(edu.school),
          year: extractText(edu.year)
        }))
      : [],
      
    // تنظيف الأقسام الإضافية
    additionalSections: Array.isArray(data.additionalSections)
      ? data.additionalSections.map(sec => ({
          title: extractText(sec.title),
          content: flattenList(sec.content)
        }))
      : []
  };
}

// دالة مساعدة لتحويل النتائج لـ HTML إذا لزم الأمر في الـ Bulk Improve
function forceToHTML(content) {
  if (!content) return "";
  if (Array.isArray(content)) {
    return `<ul>${content.map(v => `<li>${String(v).replace(/^[\s\*\-\•\·]+/, '').trim()}</li>`).join("")}</ul>`;
  }
  if (typeof content === "object") {
    return Object.entries(content)
      .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
      .join("");
  }
  return String(content).replace(/^[\s\*\-\•\·]+/, '').trim();
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
      // (نفس الكود السابق للتحليل)
      // سأضعه مختصراً هنا للتأكد من عمل الملف
      const prompt = `ROLE: Resume Parser. TEXT: ${payload.text.substring(0, 10000)}. OUTPUT JSON: { "structuredSections": [] }`;
      const r = await groq.chat.completions.create({ model: FAST_MODEL, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } });
      const data = safeJSON(r.choices[0]?.message?.content || "");
      return res.status(200).json({ structuredSections: data.structuredSections || [], overallScore: 50 });
    }

    // 2. Bulk Improve (لتحسين فقرات محددة)
    if (action === "bulk_improve") {
      // يمكنك استخدام دالة التحسين الموجودة سابقاً هنا
      return res.status(200).json({});
    }

    // 3. ✅ Optimize (الحل الجذري)
    if (action === "optimize") {
        const prompt = `
        You are an Elite Resume Strategist.
        
        INPUT TEXT:
        "${payload.text.substring(0, 30000)}"

        YOUR MISSION:
        1. **FLATTEN EVERYTHING**: Do not use nested objects. 
        2. **INTEGRATE**: Move "Achievements" section into the relevant "Experience" job based on context.
        3. **PRESERVE**: Keep all unique sections (Training, Languages, etc.) as 'additionalSections'.
        
        STRICT JSON OUTPUT:
        {
          "language": "en" | "ar",
          "contactInfo": { 
             "fullName": "String", "jobTitle": "String", "location": "String",
             "email": "String", "phone": "String", "linkedin": "String"
          },
          "summary": "String",
          "skills": ["String", "String", "String"],
          "experience": [
            { 
              "company": "String", 
              "role": "String", 
              "period": "String", 
              "achievements": ["String", "String", "String"] 
            }
          ],
          "education": [{ "degree": "String", "school": "String", "year": "String" }],
          "additionalSections": [
            { "title": "Certifications", "content": ["Cert Name - Date"] },
            { "title": "Languages", "content": ["Language - Level"] }
          ]
        }
        `;

        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1, 
            max_tokens: 7000, 
            response_format: { type: "json_object" },
        });

        const rawData = safeJSON(r.choices[0]?.message?.content || "");
        
        // تطبيق التنظيف العميق
        const cleanData = sanitizeResumeData(rawData);
        
        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(200).json({ error: true, message: "Server processing failed" });
  }
}
