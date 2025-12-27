import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.API_KEY,
});

const MODEL_NAME = "llama-3.3-70b-versatile";

/* =========================
   Helpers
========================= */
function cleanAndParseJSON(text) {
  if (!text) return {};
  try {
    let clean = text.replace(/```json|```/g, "").trim();
    const start = Math.min(
      ...["{", "["]
        .map((c) => clean.indexOf(c))
        .filter((i) => i !== -1)
    );
    const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
    if (start !== -1 && end !== -1) {
      clean = clean.substring(start, end + 1);
    }
    return JSON.parse(clean);
  } catch {
    return { error: "Invalid JSON from model" };
  }
}

function calculateATSScore(data) {
  const flags = data?.parsingFlags || {};
  if (flags.isGraphic || flags.hasColumns || flags.hasTables) return 35;

  let penalty = 0;
  if (!flags.hasStandardSectionHeaders) penalty += 20;
  if (flags.contactInfoInHeader) penalty += 15;

  const metrics = data?.metrics || {};
  const totalBullets = Math.max(metrics.totalBulletPoints || 1, 1);
  const bulletsWithMetrics = metrics.bulletsWithMetrics || 0;

  const impactScore =
    (Math.min(bulletsWithMetrics / totalBullets, 0.4) / 0.4) * 40;

  const hardSkillsCount = data?.hardSkillsFound?.length || 0;
  const skillsScore = (Math.min(hardSkillsCount, 8) / 8) * 30;

  const sections =
    data?.structuredSections?.map((s) => s.title.toLowerCase()) || [];
  let structureScore = 0;
  if (sections.some((s) => s.includes("experience"))) structureScore += 5;
  if (sections.some((s) => s.includes("education"))) structureScore += 5;
  if (sections.some((s) => s.includes("skill"))) structureScore += 5;
  if (sections.length >= 4) structureScore += 5;

  const formattingIssues = data?.formattingIssues?.length || 0;
  const formattingScore = Math.max(0, 10 - formattingIssues * 2);

  return Math.round(
    Math.min(
      100,
      impactScore + skillsScore + structureScore + formattingScore - penalty
    )
  );
}

/* =========================
   Main Handler
========================= */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  const { action, payload } = req.body;

  try {
    let prompt = "";
    let temperature = 0;
    let result = {};

    /* ========== ANALYZE ========== */
    if (action === "analyze") {
      prompt = `
ROLE: Expert ATS Resume Scanner.
CRITICAL: Return ONLY valid JSON.

RESUME:
${payload.text.substring(0, 25000)}

OUTPUT JSON:
{
  "extractedHeadlines": ["string"],
  "parsingFlags": {
    "isGraphic": false,
    "hasColumns": false,
    "hasTables": false,
    "hasStandardSectionHeaders": true,
    "contactInfoInHeader": false
  },
  "hardSkillsFound": ["string"],
  "softSkillsFound": ["string"],
  "metrics": {
    "totalBulletPoints": 0,
    "bulletsWithMetrics": 0,
    "sectionCount": 0
  },
  "formattingIssues": ["string"],
  "summaryFeedback": "string",
  "structuredSections": [
    { "id": "string", "title": "string", "content": "string" }
  ]
}`;
    }

    /* ========== SMART IMPROVE ========== */
    else if (action === "improve_with_instructions") {
      temperature = 0.3;
      prompt = `
You are a Professional Resume Writer.

INPUT CONTENT:
"${payload.content}"

IMPROVEMENT INSTRUCTION:
${payload.instruction}

CRITICAL RULES:
1. Detect language ONLY from INPUT CONTENT.
2. Arabic input → Arabic output.
3. English input → English output.
4. Never translate.
5. Use strong action verbs.
6. Add quantifiable impact when possible.
7. Optimize for ATS keywords naturally.

FORMAT:
- Return HTML only (<p>, <ul>, <li>, <strong>)

OUTPUT JSON:
{
  "improvedContent": "HTML",
  "whyImproved": [
    "Stronger action verbs",
    "Added impact metrics",
    "Improved ATS keyword density"
  ]
}`;
    }

    /* ========== SIMPLE IMPROVE ========== */
    else if (action === "improve") {
      prompt = `
Rewrite this resume section professionally.

TITLE: ${payload.title}
CONTENT: ${payload.content}

Rules:
- Keep original language.
- ATS optimized.
- Clear and concise.

OUTPUT JSON:
{
  "professional": "string",
  "atsOptimized": "string"
}`;
    }

    /* ========== MATCH ========== */
    else if (action === "match") {
      prompt = `
Match Resume against Job Description.

JOB DESCRIPTION:
${payload.jd.substring(0, 4000)}

RESUME:
${payload.resume.substring(0, 10000)}

OUTPUT JSON:
{
  "matchedCoreKeywords": [],
  "missingCoreKeywords": [],
  "matchedSecondaryKeywords": [],
  "missingSecondaryKeywords": [],
  "matchFeedback": "",
  "matchPercentage": 0
}`;
    }

    const completion = await groq.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature,
      response_format: { type: "json_object" },
    });

    result = cleanAndParseJSON(
      completion.choices[0]?.message?.content || "{}"
    );

    if (action === "analyze") {
      result.overallScore = calculateATSScore(result);
    }

    if (action === "match") {
      const coreMatch = result.matchedCoreKeywords?.length || 0;
      const coreMiss = result.missingCoreKeywords?.length || 0;
      const secMatch = result.matchedSecondaryKeywords?.length || 0;
      const secMiss = result.missingSecondaryKeywords?.length || 0;

      const total = (coreMatch + coreMiss) * 3 + (secMatch + secMiss);
      const earned = coreMatch * 3 + secMatch;
      result.matchPercentage = total
        ? Math.round((earned / total) * 100)
        : 0;
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Backend Error:", err);
    return res.status(500).json({ error: err.message });
  }
} 
