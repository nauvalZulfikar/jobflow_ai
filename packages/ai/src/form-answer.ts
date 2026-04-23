import { openai, AI_MODEL } from './client.js'
import type { ResumeContent } from '@jobflow/shared'
import type { DetectedField, FormAnswer } from '@jobflow/shared'

// ---- Extension field resolution (no screenshots, DOM-only) ----

export interface ExtensionField {
  selector: string
  label: string
  type: string
  required?: boolean
  options?: { value: string; text: string }[]
  customOptions?: { text: string }[]
}

export interface ResolvedField {
  selector: string
  value: string
}

const EXTENSION_STANDARD_PATTERNS: { patterns: string[]; key: string }[] = [
  { patterns: ['first name', 'nama depan', 'given name', 'firstname', 'fname'], key: 'firstName' },
  { patterns: ['last name', 'nama belakang', 'surname', 'lastname', 'lname'], key: 'lastName' },
  { patterns: ['full name', 'nama lengkap', 'nama', 'name'], key: 'fullName' },
  { patterns: ['email'], key: 'email' },
  { patterns: ['phone', 'telepon', 'hp', 'mobile', 'telephone', 'no hp'], key: 'phone' },
  { patterns: ['linkedin'], key: 'linkedin' },
  { patterns: ['github'], key: 'github' },
  { patterns: ['portfolio', 'website'], key: 'portfolio' },
  { patterns: ['city', 'kota'], key: 'city' },
  { patterns: ['address', 'alamat'], key: 'address' },
]

function matchExtensionStandard(label: string, resumeData: Record<string, string>): string | null {
  const l = label.toLowerCase()
  for (const { patterns, key } of EXTENSION_STANDARD_PATTERNS) {
    if (patterns.some((p) => l.includes(p))) return resumeData[key] || null
  }
  return null
}

export async function resolveExtensionFields(
  fields: ExtensionField[],
  resumeData: Record<string, string>
): Promise<ResolvedField[]> {
  const results: ResolvedField[] = []
  const aiFields: ExtensionField[] = []

  for (const field of fields) {
    if (field.type === 'file') continue
    const standard = matchExtensionStandard(field.label, resumeData)
    if (standard) {
      results.push({ selector: field.selector, value: standard })
    } else {
      aiFields.push(field)
    }
  }

  if (aiFields.length === 0) return results

  const fieldList = aiFields
    .map((f, i) => {
      let desc = `${i + 1}. selector: "${f.selector}"\n   label: "${f.label}"\n   type: ${f.type}`
      if (f.options?.length) desc += `\n   options: ${f.options.map((o) => `"${o.text}"`).join(', ')}`
      if (f.customOptions?.length) desc += `\n   options: ${f.customOptions.map((o) => `"${o.text}"`).join(', ')}`
      if (f.required) desc += `\n   required: yes`
      return desc
    })
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are filling a job application form automatically based on resume data.
For select/dropdown: pick EXACTLY one value from the available options list.
For EEOC fields (gender, race, ethnicity, disability, veteran status): always pick "decline to answer" / "prefer not to say".
For work authorization / eligibility yes/no: pick "Yes". For visa sponsorship: pick "No".
For open-ended questions: write 2-3 honest sentences based on the resume.
Only include fields you can answer from the resume. Skip fields with no relevant data.
Return JSON: { "fields": [{ "selector": "...", "value": "..." }] }`,
      },
      {
        role: 'user',
        content: `RESUME:\n${JSON.stringify(resumeData, null, 2)}\n\nFIELDS:\n${fieldList}`,
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? '{"fields":[]}'
  const parsed = JSON.parse(text) as { fields: { selector: string; value: string }[] }

  for (const f of parsed.fields ?? []) {
    if (f.selector && f.value != null) {
      results.push({ selector: f.selector, value: String(f.value) })
    }
  }

  return results
}

export async function findApplyButton(
  elements: { selector: string; text: string; ariaLabel: string }[]
): Promise<string | null> {
  if (elements.length === 0) return null
  if (elements.length === 1) return elements[0].selector

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    response_format: { type: 'json_object' },
    max_tokens: 100,
    messages: [
      {
        role: 'system',
        content: `You are on a job listing page. Pick the one element that directly starts the application process.
Prefer native apply buttons ("Easy Apply", "Apply", "Apply now") over company website links or save/share buttons.
Return JSON: { "selector": "css selector of the chosen element" }`,
      },
      {
        role: 'user',
        content: JSON.stringify(elements),
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(text) as { selector?: string }
  return parsed.selector || elements[0].selector
}

export async function recoverExtensionField(
  field: ExtensionField,
  error: string,
  valueAttempted: string,
  resumeData: Record<string, string>
): Promise<ResolvedField | null> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: `A form field fill attempt failed. Suggest an alternative selector or value.
Return JSON: { "selector": "css selector", "value": "value to fill" }
If no alternative exists, return { "skip": true }`,
        },
        {
          role: 'user',
          content: `Field: ${JSON.stringify(field)}\nError: ${error}\nValue attempted: "${valueAttempted}"\nResume: ${JSON.stringify(resumeData)}`,
        },
      ],
    })

    const text = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(text) as { selector?: string; value?: string; skip?: boolean }
    if (parsed.skip || !parsed.value) return null
    return { selector: parsed.selector || field.selector, value: String(parsed.value) }
  } catch {
    return null
  }
}

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
