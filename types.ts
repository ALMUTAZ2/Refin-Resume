export interface ResumeSection {
  id: string;
  title: string;
  content: string;
  originalContent?: string;
}

export interface ParsingFlags {
  isGraphic: boolean;
  hasColumns: boolean;
  hasTables: boolean;
  hasStandardSectionHeaders: boolean;
  contactInfoInHeader: boolean;
}

export interface AnalysisResult {
  detectedRole: string;
  parsingFlags: ParsingFlags;
  hardSkillsFound: string[];
  missingHardSkills: string[];
  softSkillsFound: string[];
  metrics: {
    totalBulletPoints: number;
    bulletsWithMetrics: number;
    weakVerbsCount: number;
    sectionCount: number;
  };
  formattingIssues: string[];
  criticalErrors: string[];
  strengths: string[];
  weaknesses: string[];
  summaryFeedback: string;
  structuredSections: ResumeSection[];
  overallScore?: number;
}

export interface ImprovedContent {
  professional: string;
  atsOptimized: string;
}

export interface JobMatchResult {
  matchPercentage: number;
  matchingKeywords: string[];
  missingKeywords: string[];
  matchFeedback: string;
  tailoredSections?: ResumeSection[]; 
}

// ✅ التعديل هنا: تمت إضافة email, phone, linkedin لتصحيح الخطأ
export interface OptimizedResume {
  language: string;
  contactInfo: {
    fullName: string;
    jobTitle: string;
    location: string;
    email?: string;    // <-- تمت الإضافة
    phone?: string;    // <-- تمت الإضافة
    linkedin?: string; // <-- تمت الإضافة
  };
  summary: string;
  skills: string[];
  experience: {
    company: string;
    role: string;
    period: string;
    achievements: string[];
  }[];
  education: {
    degree: string;
    school: string;
    year: string;
  }[];
  additionalSections: {
    title: string;
    content: string[];
  }[];
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR'
}
