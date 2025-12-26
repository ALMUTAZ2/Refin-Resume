export interface ResumeSection {
    id: string;
      title: string;
        content: string;
          originalContent?: string;
          }

          // ✅ جديد: مؤشرات الأخطاء القاتلة والهيكلية
          // نستخدم Boolean بدلاً من النصوص لضمان الدقة البرمجية
          export interface ParsingFlags {
            isGraphic: boolean;               // هل السيرة عبارة عن صورة؟
              hasColumns: boolean;              // هل يوجد تخطيط أعمدة؟ (خطأ قاتل)
                hasTables: boolean;               // هل توجد جداول؟ (خطأ قاتل)
                  hasStandardSectionHeaders: boolean; // هل العناوين قياسية؟ (Experience, Education...)
                    contactInfoInHeader: boolean;     // هل معلومات الاتصال مخفية في الـ Header؟
                    }

                    export interface AnalysisResult {
                      detectedRole: string; // يتم تعبئته من أول عنوان وظيفي صريح تم العثور عليه
                        
                          // ✅ الحقل الجديد للتحكم في الأخطاء القاتلة
                            parsingFlags: ParsingFlags; 

                              hardSkillsFound: string[];
                                missingHardSkills: string[]; // يبقى فارغاً في الفحص العام (General Scan)
                                  softSkillsFound: string[];
                                    
                                      metrics: {
                                          totalBulletPoints: number;
                                              bulletsWithMetrics: number;
                                                  weakVerbsCount: number; // تم تبسيط المنطق، قد يكون 0 في النسخة الحالية
                                                      sectionCount: number;
                                                        };
                                                          
                                                            formattingIssues: string[]; // أخطاء ثانوية نصية (مثل: تنسيق التاريخ غير موحد)
                                                              criticalErrors: string[]; // يتم توليدها في الواجهة بناءً على parsingFlags
                                                                
                                                                  strengths: string[];
                                                                    weaknesses: string[];
                                                                      summaryFeedback: string;
                                                                        structuredSections: ResumeSection[];
                                                                          
                                                                            // يتم حسابه في Service/Frontend
                                                                              overallScore?: number;
                                                                              }

                                                                              export interface ImprovedContent {
                                                                                professional: string;
                                                                                  atsOptimized: string;
                                                                                  }

                                                                                  export interface JobMatchResult {
                                                                                    matchPercentage: number;
                                                                                      matchingKeywords: string[]; // يجمع المهارات الأساسية والثانوية للعرض
                                                                                        missingKeywords: string[];  // يجمع المهارات الأساسية والثانوية المفقودة
                                                                                          matchFeedback: string;
                                                                                            tailoredSections?: ResumeSection[]; 
                                                                                            }

                                                                                            export enum AppStep {
                                                                                              UPLOAD = 'UPLOAD',
                                                                                                DASHBOARD = 'DASHBOARD',
                                                                                                  EDITOR = 'EDITOR'
                                                                                                  }
                                                                                                  
}