import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

// إعداد الموديلات:
// نستخدم 70b للمهام المعقدة (Optimize) لضمان عدم نسيان البيانات
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

// ✅ دالة جديدة لتنظيف البيانات وإصلاح مشكلة [object Object]
function sanitizeResumeData(data) {
  const cleanString = (str) => {
    if (!str) return "";
    // إزالة النقاط الزائدة أو الشرطات في بداية النص لتجنب التكرار
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
                // حل مشكلة [object Object]: لو جاء كائن نحوله لنص
                if (typeof a === 'object') return cleanString(Object.values(a).join(' '));
                return cleanString(a);
              })
            : [cleanString(exp.achievements)] 
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

function forceToHTML(content) {
  if (!content) return "";
  
  if (Array.isArray(content)) {
    return `<ul>${content.map(v => {
        let text = String(v).replace(/^[\s\*\-\•\·]+/, '').trim();
        return `<li>${text}</li>`;
    }).join("")}</ul>`;
  }
  
  if (typeof content === "object") {
    return Object.entries(content)
      .map(([k, v]) => `<div><strong>${k.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${v}</div>`)
      .join("");
  }
  
  return String(content).replace(/^[\s\*\-\•\·]+/, '').trim();
}

// ================= CORE =================

async function improveSectionsSafe(sections) {
  const TARGET = 650;
  const total = sections.reduce((s, x) => s + countWords(x.content), 0) || 1;
  const CONCURRENCY = 3; 
  const output = [];

  async function process(section) {
    const ratio = countWords(section.content) / total;
    let target = Math.round(ratio * TARGET);
    const t = section.title.toLowerCase();
    
    if ((t.includes("experience") || t.includes("project")) && target < 200) target = 200;
    if (t.includes("summary") && target < 80) target = 80;

    let strategy = `Target length: ~${target} words.`;
    let formatting = "Clean HTML strings.";

    if (t.includes('experience') || t.includes('project')) {
        formatting = "HTML List <ul><li>...";
        strategy = `EXTREME EXPANSION. Use STAR method. Write 5-8 detailed bullets per role.`;
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
      RULES: Keep facts exact. Use strong action verbs.
      FORMAT: ${formatting}
      INPUT: ${JSON.stringify(section.content).substring(0, 6000)}
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

  for (let i = 0; i < sections.length; i += CONCURRENCY) {
    const batch = sections.slice(i, i + CONCURRENCY);
    const res = await Promise.all(batch.map(process));
    output.push(...res);
  }
  return Object.fromEntries(output.map(x => [x.id, x.content]));
}

// ================= Handler =================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === "OPTIONS") return res.status(200).end();
  const { action, payload } = req.body || {};

  try {
    // 1. تحليل السيرة الذاتية
    if (action === "analyze") {
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

    // 2. تحسين الأقسام (Bulk Improve)
    if (action === "bulk_improve") {
      const result = await improveSectionsSafe(payload.sections);
      return res.status(200).json(result);
    }

    // 3. ✅ تحسين السيرة الذاتية بالكامل (Optimize) - مع التعديلات الجديدة
    if (action === "optimize") {
        const prompt = `
        You are a Meticulous Resume Architect.
        
        CRITICAL INSTRUCTION: **ZERO DATA LOSS**. 
        You MUST extract and transform EVERY single job, project, education degree, and skill from the input text.
        
        ❌ DO NOT summarize multiple roles into one.
        ❌ DO NOT skip older jobs.
        ❌ DO NOT leave out specific sections like "Languages" or "Volunteering".
        
        TASK:
        1. Analyze the ENTIRE input text.
        2. Re-write the content to be ATS-Optimized (using STAR method and Action Verbs).
        3. Fit all content into the Strict JSON structure below.
        
        STRICT JSON STRUCTURE:
        {
          "language": "en" | "ar",
          "contactInfo": { "fullName": "String", "jobTitle": "String", "location": "String" },
          "summary": "Compelling professional summary (100+ words)",
          "skills": ["List", "of", "ALL", "hard", "and", "soft", "skills"],
          "experience": [
            { 
              "company": "Company Name", 
              "role": "Job Title", 
              "period": "Date Range", 
              "achievements": [
                 "Detailed bullet point 1 (STAR method)",
                 "Detailed bullet point 2 (Quantified metrics)"
              ] 
            }
          ],
          "education": [
            { "degree": "Degree Name", "school": "University Name", "year": "Year" }
          ],
          "additionalSections": [
            { 
              "title": "Projects / Languages / Certifications / Volunteering", 
              "content": ["Detail 1", "Detail 2"] 
            }
          ]
        }

        INPUT RESUME TEXT:
        "${payload.text.substring(0, 25000)}" 
        `;

        // نستخدم SMART_MODEL (70b) لأنه أذكى ولا يحذف الأقسام
        const r = await groq.chat.completions.create({
            model: SMART_MODEL, 
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_tokens: 6000, // زيادة الحد لضمان عدم انقطاع النص
            response_format: { type: "json_object" },
        });

        const rawData = safeJSON(r.choices[0]?.message?.content || "");
        
        // تنظيف البيانات من الأخطاء (object Object) والنقاط الزائدة
        const cleanData = sanitizeResumeData(rawData);
        
        return res.status(200).json(cleanData);
    }

    return res.status(200).json({});
  } catch (error) {
    console.error("API Error:", error);
    return res.status(200).json({ error: true, message: "Server processing failed" });
  }
}
