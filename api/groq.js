// api/groq.js
// هذا الملف يعمل في السيرفر فقط - مفتاحك آمن هنا 100٪
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.API_KEY, // Vercel سيقرأ المفتاح هنا بأمان
});

const MODEL_NAME = 'llama-3.3-70b-versatile';

// دوال المساعدة (نقلناها هنا)
function cleanAndParseJSON(text) {
  if (!text) return {};
  try {
    let cleanText = text.replace(/```json\s*|\s*```/g, "").trim();
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

// دالة حساب السكور
function calculateATSScore(data) {
  // نفس منطق الحساب السابق
  const metrics = data?.metrics || {};
  const totalBullets = Math.max(metrics.totalBulletPoints || 1, 1);
  const bulletsWithMetrics = metrics.bulletsWithMetrics || 0;
  const hardSkillsCount = data?.hardSkillsFound?.length || 0;
  
  const impactScore = (Math.min(bulletsWithMetrics / totalBullets, 0.4) / 0.4) * 40;
  const skillsScore = (Math.min(hardSkillsCount, 8) / 8) * 30;
  
  // نقاط افتراضية للهيكل
  const structurePoints = 20; 
  const formattingScore = 10;

  return Math.round(Math.min(100, impactScore + skillsScore + structurePoints + formattingScore));
}

export default async function handler(req, res) {
  // السماح بـ CORS (لأن الواجهة قد تطلب من نفس الدومين)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, payload } = req.body;

  try {
    let prompt = '';
    
    // 1. توجيه الطلبات حسب نوع العمل
    if (action === 'analyze') {
      prompt = `
        ROLE: Expert ATS Resume Scanner.
        CRITICAL: Return ONLY valid JSON.
        RESUME: ${payload.text.substring(0, 25000)}
        OUTPUT JSON Schema:
        {
          "extractedHeadlines": ["string"],
          "parsingFlags": {"isGraphic": false, "hasColumns": false, "hasTables": false, "hasStandardSectionHeaders": true, "contactInfoInHeader": false},
          "hardSkillsFound": ["string"],
          "softSkillsFound": ["string"],
          "metrics": {"totalBulletPoints": 0, "bulletsWithMetrics": 0, "sectionCount": 0},
          "formattingIssues": ["string"],
          "summaryFeedback": "string",
          "structuredSections": [{"id": "string", "title": "string", "content": "string"}]
        }
      `;
    } 
    else if (action === 'improve') {
      prompt = `
        Rewrite section "${payload.title}".
        Tone: Executive & ATS Optimized.
        Content: ${payload.content}
        Output JSON: { "professional": "string", "atsOptimized": "string" }
      `;
    }
    else if (action === 'match') {
      prompt = `
        Match Resume vs JD.
        JD: ${payload.jd.substring(0, 4000)}
        RESUME: ${payload.resume.substring(0, 10000)}
        Output JSON: { "matchedCoreKeywords": [], "missingCoreKeywords": [], "matchFeedback": "", "matchPercentage": 0 }
      `;
    }

    // تنفيذ الطلب لـ Groq
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: MODEL_NAME,
      temperature: 0,
      response_format: { type: "json_object" }
    });

    const data = cleanAndParseJSON(completion.choices[0]?.message?.content || "{}");

    // إضافة الحسابات الإضافية في حالة التحليل
    if (action === 'analyze') {
      data.overallScore = calculateATSScore(data);
    }

    // إرسال النتيجة للواجهة
    res.status(200).json(data);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
