import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'

export async function tailorResume(
  resumeContent: ResumeContent,
  jobDescription: string
): Promise<ResumeContent> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah pakar penulisan resume profesional.
Tulis ulang bullet points pengalaman kerja agar relevan dengan JD.
ATURAN: jangan ubah fakta, hanya framing. Kembalikan JSON dengan struktur sama persis dengan input.`,
      },
      {
        role: 'user',
        content: `RESUME (JSON):
${JSON.stringify(resumeContent, null, 2)}

DESKRIPSI PEKERJAAN:
${jobDescription}

Kembalikan JSON resume yang sudah dioptimalkan.`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as ResumeContent
}
