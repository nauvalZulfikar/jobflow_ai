import { openai, AI_MODEL } from './client.js'

export type QuestionBankResult = {
  technical: string[]
  behavioral: string[]
  situational: string[]
  total: number
}

export async function generateQuestionBank(
  resumeText: string,
  jobDescription: string
): Promise<QuestionBankResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah career coach profesional yang membantu kandidat mempersiapkan wawancara kerja.
Selalu balas dengan JSON valid saja. Format:
{
  "technical": ["<pertanyaan teknis>", ...],
  "behavioral": ["<pertanyaan behavioral>", ...],
  "situational": ["<pertanyaan situasional>", ...]
}
Hasilkan tepat 5 pertanyaan untuk setiap kategori.`,
      },
      {
        role: 'user',
        content: `Berdasarkan resume dan deskripsi pekerjaan berikut, buat 5 pertanyaan teknis, 5 behavioral, dan 5 situasional untuk persiapan wawancara.

RESUME:
${resumeText}

DESKRIPSI PEKERJAAN:
${jobDescription}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  const parsed = JSON.parse(text) as Omit<QuestionBankResult, 'total'>
  return {
    ...parsed,
    total: (parsed.technical?.length ?? 0) + (parsed.behavioral?.length ?? 0) + (parsed.situational?.length ?? 0),
  }
}
