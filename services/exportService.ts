
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import * as FileSaver from "file-saver";
import { jsPDF } from "jspdf";
import { ResumeSection } from "../types";

export class ExportService {
  private static getSaveAs() {
    return (FileSaver as any).saveAs || (FileSaver as any).default?.saveAs || (FileSaver as any).default;
  }

  // Helper to convert HTML to structure compatible with exporters
  private static stripHtmlAndFormat(html: string): string {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    
    // Replace <br> and <div> with newlines
    const content = tmp.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<div>/gi, '')
      .replace(/<li>/gi, '• ')
      .replace(/<\/li>/gi, '\n');
      
    // Create another element to get clean text
    const cleanTmp = document.createElement("DIV");
    cleanTmp.innerHTML = content;
    return cleanTmp.textContent || cleanTmp.innerText || "";
  }

  static async generateDocx(sections: ResumeSection[]) {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: sections.flatMap((section) => [
            new Paragraph({
              text: section.title.toUpperCase(),
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 240, after: 120 },
            }),
            ...this.stripHtmlAndFormat(section.content || "").split('\n').filter(line => line.trim()).map(line => {
              return new Paragraph({
                children: [new TextRun({ text: line, size: 22 })],
                spacing: { after: 80 },
                alignment: AlignmentType.JUSTIFIED
              });
            }),
          ]),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const saveAs = this.getSaveAs();
    saveAs(blob, "ATS_Optimized_Resume.docx");
  }

  static generateTxt(sections: ResumeSection[]) {
    let content = "";
    sections.forEach(section => {
      content += `${section.title.toUpperCase()}\n`;
      content += `${"=".repeat(section.title.length)}\n`;
      content += `${this.stripHtmlAndFormat(section.content || "")}\n\n`;
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const saveAs = this.getSaveAs();
    saveAs(blob, "ATS_Optimized_Resume.txt");
  }

  static async generatePdf(sections: ResumeSection[]) {
    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxLineWidth = pageWidth - margin * 2;
    const footerMargin = 15;

    let yOffset = margin;

    sections.forEach((section) => {
      const cleanText = this.stripHtmlAndFormat(section.content || "");
      const sectionLines = doc.splitTextToSize(cleanText, maxLineWidth);

      // Section Title Check
      if (yOffset + 20 > pageHeight - footerMargin) {
        doc.addPage();
        yOffset = margin;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(section.title.toUpperCase(), margin, yOffset);
      
      yOffset += 2;
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, yOffset, pageWidth - margin, yOffset);
      yOffset += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      
      sectionLines.forEach((line: string) => {
        if (yOffset + 7 > pageHeight - footerMargin) {
          doc.addPage();
          yOffset = margin;
        }

        doc.text(line, margin, yOffset);
        yOffset += 5.5;
      });

      yOffset += 6; // Space after section
    });

    doc.save("ATS_Optimized_Resume.pdf");
  }
}
