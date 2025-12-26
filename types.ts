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

export enum AppStep {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR'
}
