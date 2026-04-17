import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

const STANDARD_FIELD_PATTERNS: { patterns: string[]; key: keyof ResumeContent['personalInfo'] }[] = [
  { patterns: ['first_name', 'firstname', 'fname', 'given_name', 'nama_depan'], key: 'firstName' },
  { patterns: ['last_name', 'lastname', 'lname', 'family_name', 'surname', 'nama_belakang'], key: 'lastName' },
  { patterns: ['email', 'email_address', 'emailaddress', 'surel'], key: 'email' },
  { patterns: ['phone', 'phone_number', 'mobile', 'telephone', 'hp', 'telepon', 'no_hp'], key: 'phone' },
  { patterns: ['city', 'kota', 'domisili', 'location', 'lokasi'], key: 'location' },
]

function matchStandardField(field: DetectedField, personalInfo: ResumeContent['personalInfo']): string | null {
  const normalizedName = field.name.toLowerCase().replace(/[-\s]/g, '_')
  const normalizedLabel = field.label.toLowerCase().replace(/[-\s]/g, '_')

  for (const { patterns, key } of STANDARD_FIELD_PATTERNS) {
    if (patterns.some((p) => normalizedName.includes(p) || normalizedLabel.includes(p))) {
      return (personalInfo[key] as string) ?? null
    }
  }
  return null
}

export async function generateFormAnswers(
  resumeContent: ResumeContent,
  jobDescription: string,
  fields: DetectedField[],
  siteLanguage: 'id' | 'en' = 'id'
): Promise<FormAnswer[]> {
  const results: FormAnswer[] = []
  const customFields: DetectedField[] = []

  for (const field of fields) {
    // Skip file inputs — handled separately via setInputFiles
    if (field.type === 'file') continue

    const standardValue = matchStandardField(field, resumeContent.personalInfo)
    if (standardValue) {
      results.push({
        fieldName: field.name,
        label: field.label,
        value: standardValue,
        aiGenerated: false,
      })
    } else {
      customFields.push(field)
    }
  }

  if (customFields.length === 0) return results

  const lang = siteLanguage === 'id' ? 'Bahasa Indonesia' : 'English'
  const fieldList = customFields
    .map((f, i) => {
      const optionsNote = f.options?.length ? `\n   Pilihan: ${f.options.join(' | ')}` : ''
      const maxNote = f.maxLength ? `\n   Maks ${f.maxLength} karakter` : ''
      return `${i + 1}. fieldName: "${f.name}"\n   Label: "${f.label}"\n   Tipe: ${f.type}${optionsNote}${maxNote}`
    })
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Kamu mengisi formulir lamaran kerja secara otomatis berdasarkan data resume.
Jawab dalam ${lang}. Jawaban harus jujur dan berdasarkan resume yang diberikan — jangan mengarang fakta.
Untuk field select/radio: pilih SATU dari opsi yang tersedia, tulis persis sama.
Untuk field number (mis. "years of experience"): hitung dari data pengalaman di resume.
Untuk pertanyaan terbuka (mis. "why do you want to work here?"): tulis 2-3 kalimat yang relevan dengan JD.
Kembalikan JSON: { "answers": [{ "fieldName": "...", "value": "..." }] }`,
      },
      {
        role: 'user',
        content: `RESUME:\n${JSON.stringify(resumeContent, null, 2)}\n\nDESKRIPSI PEKERJAAN:\n${jobDescription}\n\nFIELD YANG PERLU DIISI:\n${fieldList}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? '{"answers":[]}'
  const parsed = JSON.parse(text) as { answers: { fieldName: string; value: string }[] }

  for (const ans of parsed.answers ?? []) {
    const field = customFields.find((f) => f.name === ans.fieldName)
    if (field && ans.value != null) {
      results.push({
        fieldName: ans.fieldName,
        label: field.label,
        value: String(ans.value),
        aiGenerated: true,
      })
    }
  }

  return results
}
