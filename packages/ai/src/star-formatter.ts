import { openai, AI_MODEL } from './client.js'

export type StarStoryResult = {
  situation: string
  task: string
  action: string
  result: string
  competencies: string[]
}

export async function formatStarStory(rawText: string): Promise<StarStoryResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah career coach profesional yang membantu kandidat menyusun cerita pengalaman kerja dalam format STAR (Situation, Task, Action, Result).
Selalu balas dengan JSON valid saja. Format:
{
  "situation": "<konteks dan latar belakang situasi>",
  "task": "<tugas atau tanggung jawab yang dihadapi>",
  "action": "<tindakan spesifik yang diambil>",
  "result": "<hasil yang dicapai, termasuk angka atau metrik jika ada>",
  "competencies": ["<kompetensi yang ditunjukkan>", ...]
}`,
      },
      {
        role: 'user',
        content: `Ubah teks pengalaman kerja berikut menjadi format STAR yang terstruktur dan profesional:

${rawText}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as StarStoryResult
}
