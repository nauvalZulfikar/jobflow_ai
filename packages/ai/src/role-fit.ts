import { openai, AI_MODEL } from './client.js'

export type RoleFitResult = {
  fitScore: number
  explanation: string
  strengths: string[]
  developmentAreas: string[]
  recommendation: string
}

export async function explainRoleFit(
  resumeText: string,
  jobDescription: string
): Promise<RoleFitResult> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah career advisor profesional yang mengevaluasi kecocokan kandidat dengan posisi pekerjaan secara mendalam.
Selalu balas dengan JSON valid saja. Format:
{
  "fitScore": <number 0-100>,
  "explanation": "<penjelasan detail kecocokan kandidat dengan posisi>",
  "strengths": ["<kelebihan kandidat untuk posisi ini>", ...],
  "developmentAreas": ["<area yang perlu dikembangkan>", ...],
  "recommendation": "<rekomendasi apakah kandidat cocok untuk melamar posisi ini>"
}`,
      },
      {
        role: 'user',
        content: `Evaluasi kecocokan kandidat berikut dengan deskripsi pekerjaan dan berikan penjelasan mendetail.

RESUME:
${resumeText}

DESKRIPSI PEKERJAAN:
${jobDescription}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as RoleFitResult
}
