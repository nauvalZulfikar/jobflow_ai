import OpenAI from 'openai'
import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'

export type InterviewMessage = {
  role: 'interviewer' | 'candidate'
  content: string
}

export type InterviewFeedback = {
  score: number
  strengths: string[]
  improvements: string[]
  overallFeedback: string
}

export async function* streamMockInterview(
  resume: ResumeContent,
  jobDescription: string,
  history: InterviewMessage[],
  candidateAnswer: string
): AsyncGenerator<string> {
  const systemPrompt = `Kamu adalah pewawancara profesional.
DESKRIPSI PEKERJAAN: ${jobDescription}
PROFIL KANDIDAT: ${JSON.stringify(resume.personalInfo)}
INSTRUKSI: Tanya satu pertanyaan pada satu waktu, beri feedback singkat setelah setiap jawaban. Gunakan bahasa Indonesia yang profesional.`

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((msg) => ({
      role: (msg.role === 'interviewer' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: msg.content,
    })),
  ]

  if (candidateAnswer) {
    messages.push({ role: 'user', content: candidateAnswer })
  } else {
    messages.push({
      role: 'user',
      content: 'Mulai sesi wawancara. Perkenalkan dirimu dan ajukan pertanyaan pertama.',
    })
  }

  const stream = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages,
    stream: true,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

export async function generateInterviewFeedback(
  resume: ResumeContent,
  jobDescription: string,
  history: InterviewMessage[]
): Promise<InterviewFeedback> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Berikan evaluasi akhir sesi wawancara dalam JSON:
{
  "score": <0-100>,
  "strengths": ["<string>"],
  "improvements": ["<string>"],
  "overallFeedback": "<string>"
}`,
      },
      {
        role: 'user',
        content: `DESKRIPSI PEKERJAAN: ${jobDescription}

RIWAYAT WAWANCARA:
${history.map((m) => `${m.role === 'interviewer' ? 'Pewawancara' : 'Kandidat'}: ${m.content}`).join('\n\n')}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No feedback from AI')
  return JSON.parse(text) as InterviewFeedback
}
