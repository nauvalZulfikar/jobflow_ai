import { openai, AI_MODEL } from './client.js'
import type { MatchScoreResult } from '@jobflow/shared'

export async function matchScore(
  resumeText: string,
  jobDescription: string
): Promise<MatchScoreResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah sistem ATS (Applicant Tracking System) profesional.
Selalu balas dengan JSON valid saja. Format:
{
  "score": <number 0-100>,
  "summary": "<string>",
  "strengths": ["<string>"],
  "gaps": ["<string>"],
  "missingKeywords": ["<string>"]
}`,
      },
      {
        role: 'user',
        content: `Berikan skor kecocokan antara resume dan deskripsi pekerjaan berikut.

RESUME:
${resumeText}

DESKRIPSI PEKERJAAN:
${jobDescription}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as MatchScoreResult
}
