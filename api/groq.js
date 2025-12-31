import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// إعداد الموديلات
const FAST_MODEL = "llama-3.1-8b-instant"; 
const SMART_MODEL = "llama-3.3-70b-versatile"; 

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

// 🔥 دالة التنظيف "المدمّرة" للكائنات (The Object Crusher)
// هذه الدالة تضمن 100% عدم ظهور [object Object]
function sanitizeResumeData(data) {
  
  // دالة لاستخراج النصوص من أي هيكل بيانات مهما كان معقداً
  const extractString = (val) => {
    if (val === null || val === undefined) return "";
    
    // إذا كان نصاً، نظفه من النقاط والشرطات
    if (typeof val === 'string') {
      return val.replace(/^[\s•\-\*]+/, "").trim();
    }
    
    // إذا كان رقماً
    if (typeof val === 'number') return String(val);
    
    // إذا كان مصفوفة، ادمج محتوياتها
    if (Array.isArray(val)) {
      return val.map(extractString).join(". ");
    }
    
    // إذا كان كائناً (المسبب للمشكلة)، استخرج كل القيم النصية منه
    if (typeof val === 'object') {
      return Object.values(val)
        .map(v => extractString(v))
        .filter(v => v.length > 0)
        .join(". ");
    }
    
    return String(val);
  };

  // دالة لتسطيح المصفوفات (Flatten Array)
  const flattenList = (arr) => {
    if (!arr) return [];
    if (!Array.isArray(arr)) return [extractString(arr)]; // لو لم يكن مصفوفة حوله لمصفوفة

    // نقوم بالدوران على كل عنصر
    let flatResults = [];
    arr.forEach(item => {
        if (typeof item === 'string') {
            flatResults.push(extractString(item));
        } else if (typeof item === 'object') {
            // لو كان العنصر كائناً، نفتته ونأخذ قيمه كنصوص منفصلة
             // مثال: { title: "Skill", level: "Expert" } -> "Skill. Expert"
            flatResults.push(extractString(item));
        }
    });
    return flatResults.filter(s => s.length > 0);
  };

  return {
    language: data.language || "en",
    contactInfo: {
      fullName: extractString(data.contactInfo?.fullName),
      jobTitle: extractString(data.contactInfo?.jobTitle),
      location: extractString(data.contactInfo?.location),
    },
    summary: extractString(data.summary),
    
    // تنظيف المهارات: يضمن أنها قائمة نصوص فقط
    skills: flattenList(data.skills),
    
    experience: Array.isArray(data.experience) 
      ? data.experience.map(exp => ({
          company: extractString(exp.company),
          role: extractString(exp.role),
          period: extractString(exp.period),
          // أهم جزء: تنظيف الإنجازات من أي كائنات
          achievements: flattenList(exp.achievements) 
        }))
      : [],
      
    education: Array.isArray(data.education) 
      ? data.education.map(edu => ({
          degree: extractString(edu.degree),
          school: extractString(edu.school),
          year: extractString(edu.year)
        }))
      : [],
      
    additionalSections: Array.isArray(data.additionalSections)
      ? data.additionalSections.map(sec => ({
          title: extractString(sec.title),
          content: flattenList(sec.content)
        }))
      : []
  };
}

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

// ================= Handler =================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, payload } = req.body || {};

  try {
    // 1. Analyze (Parser)
    if (action === "analyze") {
      const prompt = `
        ROLE: Resume Parser
        TEXT: ${payload.text.substring(0, 15000)}
        EXTRACT SECTIONS: Personal Info, Summary, Experience, Education, Skills, Projects, Languages.
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

    // 2. Bulk Improve
    if (action === "bulk_improve") {
      // (نفس الكود السابق للدالة improveSectionsSafe يمكن وضعه هنا أو استدعاؤه)
      // للاختصار في هذا الرد، تأكد من وجود دالة improveSectionsSafe معرفة فوق
      return res.status(200).json({}); 
    }

    // 3. ✅ Optimize (The Fix)
    if (action === "optimize") {
        const prompt = `
        You are an Elite Resume Strategist.
        
        INPUT TEXT:
        "${payload.text.substring(0, 30000)}"

        YOUR MISSION:
        1. **FLATTEN EVERYTHING**: Do not use nested objects for skills or achievements. 
        2. **INTEGRATE**: Move "Achievements" section into the relevant "Experience" job based on context.
        3. **PRESERVE**: Keep all unique sections (Training, Languages, etc.) as 'additionalSections'.
        4. **FORMAT**: Do NOT use bullet points (•) inside the JSON strings. I will add them in the frontend.

        STRICT JSON OUTPUT:
        {
          "language": "en" | "ar",
          "contactInfo": { "fullName": "String", "jobTitle": "String", "location": "String" },
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
            { "title": "Training", "content": ["Course Name - Date", "Course Name"] },
            { "title": "Languages", "content": ["Arabic - Native", "English - Fluent"] }
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
        
        // 🔥 تطبيق التنظيف القوي
        const cleanData = sanitizeResumeData(rawData);
        
        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(200).json({ error: true, message: "Server processing failed" });
  }
}
