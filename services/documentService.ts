import * as pdfjs from 'pdfjs-dist';

// تعريف Worker من CDN لضمان عمله في المتصفح دون تعقيدات الـ Build
pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.mjs';

declare const mammoth: any;

export class DocumentService {
  static async extractText(file: File): Promise<string> {
      const extension = file.name.split('.').pop()?.toLowerCase();

          if (extension === 'pdf') {
                return await this.extractFromPdf(file);
                    } else if (extension === 'docx' || extension === 'doc') {
                          return await this.extractFromDocx(file);
                              } else {
                                    throw new Error('Unsupported file format. Please upload PDF or Word files.');
                                        }
                                          }

                                            private static async extractFromPdf(file: File): Promise<string> {
                                                const arrayBuffer = await file.arrayBuffer();
                                                    
                                                        // تحميل المستند
                                                            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
                                                                const pdf = await loadingTask.promise;
                                                                    let fullText = '';

                                                                        for (let i = 1; i <= pdf.numPages; i++) {
                                                                              const page = await pdf.getPage(i);
                                                                                    const textContent = await page.getTextContent();
                                                                                          
                                                                                                // هنا تكمن القوة: معالجة ذكية للإحداثيات
                                                                                                      const pageText = this.processPdfTextItems(textContent.items);
                                                                                                            fullText += pageText + '\n\n';
                                                                                                                }

                                                                                                                    return this.cleanText(fullText);
                                                                                                                      }

                                                                                                                        /**
                                                                                                                           * خوارزمية ذكية لترتيب النصوص بناءً على موقعها العمودي (Y)
                                                                                                                              * تمنع تداخل النصوص في السير الذاتية ذات العمودين
                                                                                                                                 */
                                                                                                                                   private static processPdfTextItems(items: any[]): string {
                                                                                                                                       let text = '';
                                                                                                                                           let lastY = -1;

                                                                                                                                               // ملاحظة: PDF.js عادة ما يعيد العناصر مرتبة، ولكن الإحداثيات تؤكد ذلك
                                                                                                                                                   for (const item of items) {
                                                                                                                                                         const str = item.str;
                                                                                                                                                               // مصفوفة التحويل [scaleX, skewY, skewX, scaleY, x, y]
                                                                                                                                                                     // العنصر السادس (index 5) هو الإحداثي العمودي
                                                                                                                                                                           const transform = item.transform; 
                                                                                                                                                                                 const y = transform ? transform[5] : 0;

                                                                                                                                                                                       // في PDF، الإحداثيات تبدأ من الأسفل للأعلى، لذا التغير الكبير في Y يعني سطراً جديداً
                                                                                                                                                                                             if (lastY !== -1 && Math.abs(y - lastY) > 5) {
                                                                                                                                                                                                     text += '\n'; // سطر جديد
                                                                                                                                                                                                           } else if (text.length > 0 && !text.endsWith(' ') && str !== ' ') {
                                                                                                                                                                                                                   text += ' '; // مسافة نفس السطر
                                                                                                                                                                                                                         }

                                                                                                                                                                                                                               text += str;
                                                                                                                                                                                                                                     lastY = y;
                                                                                                                                                                                                                                         }

                                                                                                                                                                                                                                             return text;
                                                                                                                                                                                                                                               }

                                                                                                                                                                                                                                                 private static cleanText(text: string): string {
                                                                                                                                                                                                                                                     return text
                                                                                                                                                                                                                                                           .replace(/\s+/g, ' ')       // توحيد المسافات
                                                                                                                                                                                                                                                                 .replace(/\n\s+\n/g, '\n\n') // الحفاظ على الفقرات
                                                                                                                                                                                                                                                                       .trim();
                                                                                                                                                                                                                                                                         }

                                                                                                                                                                                                                                                                           private static async extractFromDocx(file: File): Promise<string> {
                                                                                                                                                                                                                                                                               const arrayBuffer = await file.arrayBuffer();
                                                                                                                                                                                                                                                                                   const result = await mammoth.extractRawText({ arrayBuffer });
                                                                                                                                                                                                                                                                                       return result.value;
                                                                                                                                                                                                                                                                                         }
                                                                                                                                                                                                                                                                                         }
                                                                                                                                                                                                                                                                                         