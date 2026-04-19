import type { FastifyInstance } from 'fastify'
import { openai, AI_MODEL } from '@jobflow/ai'
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
Given a screenshot + DOM snippet + the user's resume data, produce CSS selectors + values to fill each unfilled field.
Only include fields visible in the screenshot that the resume data has an answer for.
Prefer id-based or name-based selectors. Skip CAPTCHAs and file uploads.
Reply with strict JSON:
{
  "fields": [
    { "selector": "#first_name", "value": "Alex", "reason": "matches resume firstName" }
  ],
  "submitSelector": "button[type=submit]" | null,
  "unsure": "what you couldn't confidently map"
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
        `Resume data available (pick values from here, do not invent):\n${JSON.stringify(body.resumeData, null, 2)}`,
        body.domSnippet ? `DOM snippet (forms only, truncated):\n${body.domSnippet.slice(0, 6000)}` : '',
        'Return the JSON shape with fields[] + submitSelector. Only use resume values as sources.',
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
}

// Helper kept for parity — not used directly but useful for callers
export { VISION_MODEL, AI_MODEL }
