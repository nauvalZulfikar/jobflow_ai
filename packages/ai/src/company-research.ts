import { openai, AI_MODEL } from './client.js'

export type CompanyResearchResult = {
  overview: string
  culture: string[]
  interviewTips: string[]
  commonQuestions: string[]
  redFlags: string[]
  glassdoorRating: string
}

export async function researchCompany(
  companyName: string,
  jobTitle: string
): Promise<CompanyResearchResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah career advisor yang memberikan riset mendalam tentang perusahaan untuk membantu kandidat sukses dalam proses rekrutmen.
Selalu balas dengan JSON valid saja. Format:
{
  "overview": "<deskripsi singkat perusahaan>",
  "culture": ["<aspek budaya perusahaan>", ...],
  "interviewTips": ["<tips wawancara>", ...],
  "commonQuestions": ["<pertanyaan umum di perusahaan ini>", ...],
  "redFlags": ["<hal yang perlu diwaspadai>", ...],
  "glassdoorRating": "<estimasi rating atau 'Tidak tersedia'>"
}`,
      },
      {
        role: 'user',
        content: `Lakukan riset tentang perusahaan "${companyName}" untuk posisi "${jobTitle}". Berikan informasi tentang budaya perusahaan, proses wawancara, tips melamar, dan hal-hal penting lainnya.`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as CompanyResearchResult
}
