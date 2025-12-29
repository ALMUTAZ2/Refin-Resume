export class GeminiService {

  private async callBackend(action: string, payload: any) {
    const controller = new AbortController();

    // ⬅️ timeout من جهة المتصفح
    setTimeout(() => controller.abort(), 130000);

    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`API Error ${res.status}`);
    }

    return res.json();
  }

  async analyzeResume(text: string) {
    return this.callBackend('analyze', { text });
  }

  async bulkImproveATS(sections: any[]) {
    // ⛔️ لا تقسيم هنا، السيرفر يعالجها تسلسليًا
    return this.callBackend('bulk_improve', { sections });
  }

  async improveSection(title: string, content: string) {
    return this.callBackend('improve', { title, content });
  }

  async matchJobDescription(resume: string, jd: string) {
    return this.callBackend('match', { resume, jd });
  }
}
