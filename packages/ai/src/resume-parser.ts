import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'

export async function parseResume(resumeText: string): Promise<ResumeContent> {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu adalah sistem parser resume profesional.
Ekstrak semua informasi ke JSON. Format:
{
  "personalInfo": { "firstName":"","lastName":"","email":"","phone":"","location":"","linkedinUrl":"","githubUrl":"","portfolioUrl":"","summary":"" },
  "experience": [{ "id":"exp-1","company":"","title":"","location":"","startDate":"MM/YYYY","endDate":"MM/YYYY","isCurrent":false,"bullets":[] }],
  "education": [{ "id":"edu-1","institution":"","degree":"","field":"","startDate":"","endDate":"","gpa":"" }],
  "skills": [],
  "projects": [{ "id":"proj-1","name":"","description":"","url":"","technologies":[],"bullets":[] }],
  "certifications": [{ "id":"cert-1","name":"","issuer":"","issueDate":"","expiryDate":"","credentialUrl":"" }]
}
Jika data tidak ada gunakan string kosong atau array kosong.`,
      },
      {
        role: 'user',
        content: `Ekstrak informasi dari resume berikut:\n\n${resumeText}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return JSON.parse(text) as ResumeContent
}
