import type { FastifyInstance } from 'fastify'
import { openai, AI_MODEL, resolveExtensionFields, recoverExtensionField, findApplyButton } from '@jobflow/ai'
import type { ExtensionField } from '@jobflow/ai'
import { success, failure } from '@jobflow/shared'

// Vision-capable model (gpt-4o-mini supports vision in chat completions)
const VISION_MODEL = 'gpt-4o-mini'

type DiagnoseBody = {
  url: string
  screenshotBase64?: string
  domSnippet?: string
  ruleBasedReason?: string
  attempted?: string // "linkedin_easy_apply" | "ats_form" | "agent_loop"
}

type GuideFormBody = {
  url: string
  screenshotBase64?: string
  domSnippet?: string
  formFields?: Array<{
    selector: string
    tag: string
    type: string
    label: string
    required: boolean
    options?: Array<{ value: string; text: string }>
  }>
  resumeData: Record<string, string | number | null | undefined>
  filledCount?: number
  totalCount?: number
}

type AgentStepBody = {
  url: string
  screenshotBase64: string
  goal: string
  history: Array<{ action: string; reason: string; ok: boolean }>
  resumeData: Record<string, string | number | null | undefined>
  maxStep: number
  currentStep: number
}

type DomStepBody = {
  url: string
  pageState: {
    title: string
    fields: Array<{
      selector: string
      type: string
      label: string
      value: string
      required?: boolean
      options?: Array<{ value: string; text: string }>
    }>
    buttons: Array<{ selector: string; text: string }>
    bodyText: string
  }
  resumeData: Record<string, string>
  history: Array<{ step: number; actions: any[]; results: any[] }>
  currentStep: number
  maxStep: number
}

const DIAGNOSE_SYSTEM = `You are a job-application failure diagnostician.
Given a screenshot + DOM snippet + the rule-based failure reason, identify what actually went wrong.
Reply with strict JSON:
{
  "rootCause": "short snake_case cause, e.g. workday_hidden_required_field | captcha_blocker | login_wall | form_not_rendered | form_unfamiliar_structure | screening_question",
  "specifics": "one sentence, specific human-readable detail",
  "canRetry": true|false,
  "fixSuggestion": "what an engineer could add to the rule-based code to handle this"
}`

const GUIDE_SYSTEM = `You are a form-filling assistant looking at a job application form.
You will be given:
- A list of unfilled form fields, each with a CSS selector, label, type, and (for selects) options.
- The user's resume data.
You map each field to a value drawn from the resume.
HARD RULES:
- ONLY use selectors from the provided field list. NEVER invent selectors.
- For SELECT fields, "value" must match one of the option values exactly.
- Skip fields you cannot confidently map. Better to skip than to guess.
- Skip file inputs (type=file) — those are handled separately.
- For free-text screening questions without an obvious resume answer, skip them.
Reply with strict JSON:
{
  "fields": [
    { "selector": "<one of the provided selectors>", "value": "<value>", "reason": "why" }
  ],
  "submitSelector": "<best-guess submit selector or null>",
  "unsure": "fields you skipped and why"
}`

const AGENT_SYSTEM = `You are an autonomous agent driving a browser to submit a job application.
On each step you see a screenshot and prior actions. Decide the single next action.
Reply with strict JSON — pick exactly one action:
{ "action": "click", "selector": "CSS", "reason": "..." }
{ "action": "type", "selector": "CSS", "value": "text", "reason": "..." }
{ "action": "wait", "ms": 2000, "reason": "..." }
{ "action": "done", "reason": "form submitted, confirmation visible" }
{ "action": "fail", "reason": "why we should stop" }
Prefer "done" the moment a confirmation ("thank you", "application submitted") appears. If stuck for 2+ steps, "fail".`

const DOM_STEP_SYSTEM = `You are an autonomous agent filling a job application form.
You receive the current page state: URL, form fields with their current values, available buttons, visible page text, and a flag "modalOpen" indicating whether an apply modal/dialog is open.

STAGE DETECTION (critical — decide which stage you are in first):
- modalOpen=false AND URL looks like /jobs/view/ or a job-post landing page → Stage 1: OPEN APPLY. Find a button/anchor whose text is "Easy Apply", "Apply", "Apply now", "Apply on company site", "Lamar", "Lamar sekarang" and click it. Do NOT try to fill form fields on this page — there usually are none. The extension will follow the navigation (to LinkedIn Easy Apply modal OR to the external company ATS) and re-scan.
- PREFER "Easy Apply" over "Apply on company site" if both are present (easier flow).
- On LinkedIn: the Easy Apply anchor has aria-label starting with "Easy Apply to". "Apply on company site" opens an external ATS.
- IGNORE "Save job", "Save the job", "Follow", "Share", "More options", "Close" — not apply buttons.
- modalOpen=true OR the page has an actual form with >1 field and buttons like "Next"/"Submit"/"Review" → Stage 2: FILL FORM.
- bodyText contains "thank you", "application submitted", "berhasil dikirim", "sudah dilamar", or equivalent → status "done".

FORM-FILL RULES (Stage 2):
- COMPARE every field's current "value" with resumeData.
  • If pre-filled value is WRONG/STALE and resumeData has a NON-EMPTY correct value → emit "type"/"select" to overwrite. Example: pre-fill "+44 7776638756" but resumeData.phone is "081234567890" → fix it.
  • If pre-filled value is ALREADY correct → skip.
  • If resumeData has NO value for this field (empty string, null, missing) → LEAVE the pre-filled value ALONE. Do NOT blank it out, do NOT overwrite with a guess.
- SALARY / EXPECTED COMPENSATION questions: if resumeData doesn't have an explicit salary figure, SKIP this field entirely (no "type" action). Never answer "0" — that looks insulting to recruiters. Leave blank; the user will review later.
- Free-text essay questions ("Tell us why", "Describe your experience"): SKIP unless resumeData.summary has directly-relevant content. Never fabricate.
- Use ONLY selectors from the provided fields/buttons list — NEVER invent or guess selectors. If fields list is empty, do NOT emit any "type"/"select"/"check" action. Common invented selectors to AVOID: input[name='phone'], input[name='email'], input[name='location']. If you don't see a matching entry in the fields[] array, the field does not exist.
- For SELECT: use exact option text from the options list.
- SKILL-YEARS QUESTIONS ("How many years of experience do you have with X?"):
  • FIRST: scan resumeData.skills array. Normalize (lowercase, trim) and check if the question's skill X matches ANY entry (exact or partial substring either direction).
  • IF MATCH: you MUST answer a number ≥ 1, capped at resumeData.yearsExp. Use max(2, yearsExp) for tech skills found in the array. **Never answer 0 for a skill that IS in the skills array.**
  • IF NO MATCH (skill not in array at all): answer "0".
  • You MUST fill ALL empty skill-year questions in the current page — never leave any blank. LinkedIn form validation requires every field filled.
  • Never exceed resumeData.yearsExp. Never answer blank.
- For custom-dropdown: use the option text as value.
- For EEOC fields (gender, race, ethnicity, disability, veteran): always select "decline" / "prefer not to say".
- For work authorization / right to work: "Yes". For visa sponsorship required: "No".
- After filling fields, include a click on the button that advances the form (Next, Continue, Review, Submit, etc).
- IGNORE buttons like "Save", "Dismiss", "Close", "Home", "For Business", "More options", "Connect" — those are page chrome, not form actions.

FAIL CONDITIONS:
- Captcha visible → "fail".
- Login/signin page → "fail".
- Same stuck state for 3 consecutive steps (no new fields, no progress) → "fail" with reason "stuck".
- modalOpen=false AND no button with text matching Apply/Easy Apply/Lamar → "fail" with reason "no_apply_mechanism". This job likely redirects off-platform and cannot be auto-applied.

Reply with strict JSON:
{
  "actions": [
    { "action": "type"|"select"|"click"|"check", "selector": "...", "value": "..." }
  ],
  "status": "in_progress"|"done"|"fail",
  "reason": "brief explanation"
}`

async function callVision(systemPrompt: string, userText: string, screenshotBase64?: string, maxTokens = 500) {
  const content: any[] = [{ type: 'text', text: userText }]
  if (screenshotBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${screenshotBase64}` },
    })
  }
  const res = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  })
  const text = res.choices[0]?.message?.content
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

export async function aiApplyRoutes(app: FastifyInstance) {
  // POST /api/auto-apply/find-button — AI picks which button to click on a job page
  app.post('/find-button', async (request, reply) => {
    try {
      const { elements } = request.body as {
        elements: { selector: string; text: string; ariaLabel: string }[]
      }
      if (!Array.isArray(elements) || elements.length === 0) {
        return reply.send(success({ selector: null }))
      }
      const selector = await findApplyButton(elements)
      return reply.send(success({ selector }))
    } catch (err) {
      request.log.error(err)
      return reply.send(success({ selector: null }))
    }
  })

  // POST /api/auto-apply/resolve-fields — AI field resolution from extension (no screenshot)
  app.post('/resolve-fields', async (request, reply) => {
    try {
      const { fields, resumeData } = request.body as {
        fields: ExtensionField[]
        resumeData: Record<string, string>
      }
      if (!Array.isArray(fields) || fields.length === 0) {
        return reply.send(success({ fields: [] }))
      }
      const resolved = await resolveExtensionFields(fields, resumeData)
      return reply.send(success({ fields: resolved }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal resolve fields'))
    }
  })

  // POST /api/auto-apply/recover-field — per-field AI recovery after executor error
  app.post('/recover-field', async (request, reply) => {
    try {
      const { field, error, valueAttempted, resumeData } = request.body as {
        field: ExtensionField
        error: string
        valueAttempted: string
        resumeData: Record<string, string>
      }
      const recovery = await recoverExtensionField(field, error || 'unknown', valueAttempted || '', resumeData)
      return reply.send(success(recovery))
    } catch (err) {
      request.log.error(err)
      return reply.send(success(null))
    }
  })

  // POST /api/auto-apply/diagnose
  // Vision-based explanation of why the rule-based flow failed.
  app.post('/diagnose', async (request, reply) => {
    try {
      const body = request.body as DiagnoseBody
      if (!body?.url) return reply.status(400).send(failure('BAD_REQUEST', 'url required'))

      const userText = [
        `Page URL: ${body.url}`,
        `Rule-based flow attempted: ${body.attempted || 'unknown'}`,
        `Rule-based reason for failure: ${body.ruleBasedReason || 'unknown'}`,
        body.domSnippet ? `Relevant DOM snippet (truncated):\n${body.domSnippet.slice(0, 4000)}` : '',
        'Diagnose the ACTUAL cause. Return the JSON shape specified.',
      ].filter(Boolean).join('\n\n')

      const diagnosis = await callVision(DIAGNOSE_SYSTEM, userText, body.screenshotBase64, 400)
      if (!diagnosis) return reply.send(success({ rootCause: 'diagnosis_failed', specifics: 'AI returned no content', canRetry: false, fixSuggestion: '' }))
      return reply.send(success(diagnosis))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Diagnose failed'))
    }
  })

  // POST /api/auto-apply/guide-form
  // Vision-based field mapping when rule-based filler couldn't map enough fields.
  app.post('/guide-form', async (request, reply) => {
    try {
      const body = request.body as GuideFormBody
      if (!body?.url) return reply.status(400).send(failure('BAD_REQUEST', 'url required'))

      const userText = [
        `Page URL: ${body.url}`,
        body.filledCount !== undefined ? `Rule-based filled ${body.filledCount}/${body.totalCount ?? '?'} fields.` : '',
        `Resume data (use ONLY these values):\n${JSON.stringify(body.resumeData, null, 2)}`,
        body.formFields && body.formFields.length > 0
          ? `Unfilled form fields (use ONLY these selectors):\n${JSON.stringify(body.formFields, null, 2)}`
          : (body.domSnippet ? `DOM snippet:\n${body.domSnippet.slice(0, 4000)}` : ''),
        'Return the JSON shape: fields[] using selectors from the list above + submitSelector + unsure.',
      ].filter(Boolean).join('\n\n')

      const guidance = await callVision(GUIDE_SYSTEM, userText, body.screenshotBase64, 800)
      if (!guidance) return reply.send(success({ fields: [], submitSelector: null, unsure: 'no response' }))
      return reply.send(success(guidance))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Guide-form failed'))
    }
  })

  // POST /api/auto-apply/agent-step
  // One iteration of a vision agent loop: extension captures screenshot, server decides next action.
  app.post('/agent-step', async (request, reply) => {
    try {
      const body = request.body as AgentStepBody
      if (!body?.url || !body?.screenshotBase64) {
        return reply.status(400).send(failure('BAD_REQUEST', 'url + screenshotBase64 required'))
      }

      const historyText = (body.history || [])
        .slice(-6)
        .map((h, i) => `  ${i + 1}. ${h.action} — ${h.reason} (${h.ok ? 'ok' : 'failed'})`)
        .join('\n') || '  (no prior actions)'

      const userText = [
        `Page URL: ${body.url}`,
        `Goal: ${body.goal || 'submit this job application'}`,
        `Step ${body.currentStep}/${body.maxStep}`,
        `Resume data (pull values from here):\n${JSON.stringify(body.resumeData, null, 2)}`,
        `Prior actions:\n${historyText}`,
        'Return exactly one JSON action object as specified.',
      ].join('\n\n')

      const step = await callVision(AGENT_SYSTEM, userText, body.screenshotBase64, 400)
      if (!step) return reply.send(success({ action: 'fail', reason: 'agent returned no content' }))
      return reply.send(success(step))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Agent-step failed'))
    }
  })

  // POST /api/auto-apply/dom-step
  // DOM-based agent step — no screenshot, reads structured page state instead
  app.post('/dom-step', async (request, reply) => {
    try {
      const body = request.body as DomStepBody
      if (!body?.url || !body?.pageState) {
        return reply.status(400).send(failure('BAD_REQUEST', 'url + pageState required'))
      }

      const historyText = (body.history || [])
        .slice(-5)
        .map((h, i) => `  Step ${h.step}: ${h.actions?.map((a: any) => `${a.action} ${a.selector}`).join(', ')}`)
        .join('\n') || '  (no prior actions)'

      // Server-side preprocessing: for "years of experience with X" questions,
      // compute a deterministic answer from resumeData.skills + yearsExp so the AI
      // doesn't default to 0 on skills that are clearly listed.
      const skills = Array.isArray((body.resumeData as any)?.skills) ? (body.resumeData as any).skills as string[] : []
      const skillsLower = skills.map(s => String(s || '').toLowerCase().trim()).filter(Boolean)
      const yearsExp = Math.max(1, Number((body.resumeData as any)?.yearsExp) || 1)
      const suggestions: Array<{ selector: string; label: string; suggestedYears: number; reason: string }> = []
      for (const f of body.pageState.fields) {
        const label = String(f.label || '').trim()
        // Match "years ... with <skill>?" — take everything after the LAST "with "
        const withMatch = label.match(/\bwith\s+([A-Za-z][A-Za-z0-9 +/.&\-]+?)\s*\??$/i)
        const yearsCheck = /years?\b.*\bexperience|experience\b.*\byears?|how many years/i.test(label)
        if (!withMatch || !yearsCheck) continue
        const skill = withMatch[1].trim().toLowerCase()
        const inSkills = skillsLower.some(s => s === skill || s.includes(skill) || skill.includes(s))
        suggestions.push({
          selector: f.selector,
          label,
          suggestedYears: inSkills ? yearsExp : 0,
          reason: inSkills ? `matched skill in resumeData.skills (${yearsExp}y total exp)` : 'skill not in resume',
        })
      }

      const userText = [
        `URL: ${body.url}`,
        `Page title: ${body.pageState.title}`,
        `Step ${body.currentStep}/${body.maxStep}`,
        `\nResume data:\n${JSON.stringify(body.resumeData, null, 2)}`,
        suggestions.length > 0
          ? `\nPRE-COMPUTED skill-year answers (USE THESE EXACT VALUES):\n${JSON.stringify(suggestions, null, 2)}`
          : '',
        `\nForm fields (with current values):\n${JSON.stringify(body.pageState.fields, null, 2)}`,
        `\nVisible buttons:\n${JSON.stringify(body.pageState.buttons, null, 2)}`,
        `\nPage text (first 1500 chars):\n${body.pageState.bodyText}`,
        `\nHistory:\n${historyText}`,
      ].filter(Boolean).join('\n')

      const res = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: DOM_STEP_SYSTEM },
          { role: 'user', content: userText },
        ],
        max_tokens: 800,
        response_format: { type: 'json_object' },
      })

      const text = res.choices[0]?.message?.content
      if (!text) return reply.send(success({ actions: [], status: 'fail', reason: 'no_response' }))
      try {
        const parsed = JSON.parse(text)
        // Deterministic override: for any skill-year question we pre-computed, force the value
        // regardless of what the AI chose. Fixes gpt-4o-mini inconsistency on multi-skill pages.
        if (suggestions.length > 0 && Array.isArray(parsed.actions)) {
          const sugMap = new Map(suggestions.map(s => [s.selector, s.suggestedYears]))
          for (const a of parsed.actions) {
            if (a?.action === 'type' && sugMap.has(a.selector)) {
              a.value = String(sugMap.get(a.selector))
            }
          }
          // Ensure any skill-year field the AI skipped gets filled too
          for (const s of suggestions) {
            const covered = parsed.actions.some((a: any) => a?.selector === s.selector && a?.action === 'type')
            if (!covered) {
              parsed.actions.unshift({ action: 'type', selector: s.selector, value: String(s.suggestedYears) })
            }
          }
        }

        // Post-process: strip actions the AI shouldn't have emitted (rule violations).
        // Deterministic because gpt-4o-mini sometimes ignores "skip this field" instructions.
        if (Array.isArray(parsed.actions)) {
          const fieldBySelector = new Map(body.pageState.fields.map(f => [f.selector, f]))
          const resumeAny = (body.resumeData as any) || {}
          const hasSalary = !!resumeAny.salary
          const hasSummary = !!resumeAny.summary && String(resumeAny.summary).length > 40
          const stripped: string[] = []
          parsed.actions = parsed.actions.filter((a: any) => {
            if (a?.action !== 'type' && a?.action !== 'select') return true
            const f = fieldBySelector.get(a.selector)
            if (!f) return true
            const label = String(f.label || '').toLowerCase()
            // Salary/compensation: skip unless resume explicitly has a salary figure
            if (/\b(salary|compensation|expected pay|gaji|rate expectation|desired salary)\b/.test(label) && !hasSalary) {
              stripped.push(`${a.selector} (salary without data)`)
              return false
            }
            // Free-text essays: skip unless we have a summary AND AI's answer looks non-fabricated
            if (/\b(why do you want|tell us|describe your|cover letter|motivation|what makes you|in your own words)\b/.test(label) && !hasSummary) {
              stripped.push(`${a.selector} (essay without summary)`)
              return false
            }
            // Prevent hallucination: if label maps to a known resumeData field AND that field is empty,
            // the AI has no basis to fill it. Strip the action.
            const labelToResumeKey: Array<[RegExp, string]> = [
              [/\b(first\s*name|given\s*name|nama\s*depan)\b/i, 'firstName'],
              [/\b(last\s*name|surname|family\s*name|nama\s*belakang)\b/i, 'lastName'],
              [/\b(email|e-mail|alamat\s*email)\b/i, 'email'],
              [/\b(phone|mobile|tel(ephone)?|whatsapp|nomor\s*hp|handphone)\b/i, 'phone'],
              [/\b(location|city|address|kota|alamat)\b/i, 'location'],
              [/\b(linkedin(\s*url)?|profil\s*linkedin)\b/i, 'linkedin'],
              [/\b(github|portfolio|personal\s*website)\b/i, 'github'],
            ]
            for (const [rx, key] of labelToResumeKey) {
              if (rx.test(label) && a.action === 'type') {
                const resumeVal = String(resumeAny[key] ?? '').trim()
                if (!resumeVal) {
                  stripped.push(`${a.selector} (hallucinated ${key}; resume has empty value)`)
                  return false
                }
              }
            }
            // Also: if pre-filled value exists and AI is trying to blank/zero it, keep pre-fill
            if (a.action === 'type' && f.value && f.value.length > 0) {
              const v = String(a.value ?? '').trim()
              if (v === '' || v === '0' || v === 'N/A' || v.toLowerCase() === 'n/a') {
                stripped.push(`${a.selector} (would blank out pre-fill)`)
                return false
              }
            }
            return true
          })
          if (stripped.length > 0) {
            parsed.reason = `${parsed.reason || ''} [stripped: ${stripped.join('; ')}]`.trim()
          }
        }
        return reply.send(success(parsed))
      } catch {
        return reply.send(success({ actions: [], status: 'fail', reason: 'invalid_json' }))
      }
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Dom-step failed'))
    }
  })
}

// Helper kept for parity — not used directly but useful for callers
export { VISION_MODEL, AI_MODEL }
