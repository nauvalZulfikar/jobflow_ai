import { openai, AI_MODEL } from './client.js'
import { replaceTemplateVariables } from '@jobflow/shared'
import type { ResumeContent } from '@jobflow/shared'

export async function generateCoverLetter(
  resumeContent: ResumeContent,
  jobDescription: string,
  template: string,
  variables: { companyName: string; position: string }
): Promise<string> {
  const prefilledTemplate = replaceTemplateVariables(template, {
    nama_perusahaan: variables.companyName,
    posisi: variables.position,
    nama_pengguna: `${resumeContent.personalInfo.firstName} ${resumeContent.personalInfo.lastName}`,
    tanggal: new Date().toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  })

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'system',
        content: `Kamu adalah penulis profesional surat lamaran kerja.
Lengkapi template dengan konten personal dan relevan. Kembalikan HANYA teks surat lamaran, tanpa komentar.`,
      },
      {
        role: 'user',
        content: `PROFIL PELAMAR (JSON):
${JSON.stringify(resumeContent, null, 2)}

DESKRIPSI PEKERJAAN:
${jobDescription}

TEMPLATE SURAT:
${prefilledTemplate}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('No response from AI')
  return text
}
