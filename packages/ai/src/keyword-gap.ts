import { openai, AI_MODEL } from './client.js'
import type { KeywordGapResult } from '@jobflow/shared'

export async function keywordGapAnalysis(
  resumeText: string,
  jobDescription: string
): Promise<KeywordGapResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah ahli ATS optimization.
Selalu balas dengan JSON valid saja. Format:
{
  "present": ["<keyword>"],
  "missing": ["<keyword>"],
  "recommendations": ["<string>"]
}`,
      },
      {
        role: 'user',
        content: `Analisis kata kunci dari deskripsi pekerjaan dan bandingkan dengan resume.

RESUME:
${resumeText}

DESKRIPSI PEKERJAAN:
${jobDescription}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as KeywordGapResult
}
