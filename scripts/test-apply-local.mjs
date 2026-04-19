// Local end-to-end test harness for the ATS apply pipeline.
// Simulates what the Chrome extension's service worker does, but using
// Playwright instead of the browser extension APIs. Goal: iterate on
// the rule-based + AI-assisted apply flow until at least one job is
// applied successfully, before shipping back to the extension.
//
// Usage:
//   node scripts/test-apply-local.mjs <url> [--ai] [--keep-open]
//
// Flags:
//   --ai         Call local API for guide-form / agent / diagnose fallbacks.
//   --keep-open  Leave the browser open at the end so you can inspect state.

import { chromium } from '../apps/scraper/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const API_BASE = process.env.LOCAL_API_BASE || 'http://localhost:3002/api'
const API_TOKEN = process.env.LOCAL_API_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRlc3QtdXNlci1sb2NhbCIsImlhdCI6MTc3NjYyODU2OH0.M9P7_8_6-hJcAYPczDnZUlJJCWV7_ILt9G36BRuNGzM'

// Dummy resume data — matches what fetchResumeData() builds in api-client.js
const resumeData = {
  firstName: 'Nauval',
  lastName: 'Zulfikar',
  fullName: 'Nauval Zulfikar',
  email: 'nauval.test@example.com',
  phone: '+628123456789',
  location: 'Jakarta, Indonesia',
  city: 'Jakarta',
  country: 'Indonesia',
  linkedin: 'https://linkedin.com/in/nauvalzulfikar',
  github: 'https://github.com/nauvalzulfikar',
  portfolio: '',
  summary: 'Software engineer with 3 years experience.',
  currentCompany: 'Jobflow AI',
  currentTitle: 'Software Engineer',
  yearsExp: '3',
  salary: '15000000',
  coverLetter: 'I am excited to apply for this role.',
  address: 'Jakarta, Indonesia',
  resumeUrl: null,
}

const args = process.argv.slice(2)
const useAI = args.includes('--ai')
const keepOpen = args.includes('--keep-open')
const url = args.find(a => !a.startsWith('--'))

if (!url) {
  console.error('Usage: node scripts/test-apply-local.mjs <url> [--ai] [--keep-open]')
  process.exit(1)
}

// Load the content script source so we can read FIELD_MAP + helpers
const atsSource = readFileSync(resolve(repoRoot, 'chrome-extension/content/ats-apply.js'), 'utf8')

// Extract self-contained browser code from ats-apply.js.
// We skip the `chrome.runtime.onMessage.addListener` tail and expose helpers.
const BROWSER_BOOTSTRAP = atsSource
  .replace(/chrome\.runtime\.onMessage\.addListener[\s\S]*$/, '')
  // Surface full error stacks when debugging, not just message
  .replace(
    /return \{ status: 'failed', reason: err\.message \}/g,
    "return { status: 'failed', reason: err.message, stack: String(err.stack || '').slice(0, 1500) }"
  )
  + `
window.__jobflowATS = { handleATSApply, fillForm, captureDomSnippet, executeFieldInstructions, executeAction, findSubmitButton }
`

async function callApi(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    return json?.success ? json.data : { error: json?.error || 'unknown' }
  } catch (err) {
    return { error: { code: 'NETWORK', message: err.message } }
  }
}

function log(msg) {
  const t = new Date().toISOString().slice(11, 19)
  console.log(`[${t}] ${msg}`)
}

async function main() {
  log(`Target URL: ${url}`)
  log(`AI fallback: ${useAI ? 'ENABLED' : 'disabled'}`)

  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    log('Opening page...')
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(4000)

    log('Injecting content-script logic...')
    await page.evaluate(BROWSER_BOOTSTRAP)

    log('Running rule-based ATS apply...')
    const ruleResult = await page.evaluate(async (rd) => {
      try {
        return await window.__jobflowATS.handleATSApply(rd)
      } catch (err) {
        return { status: 'failed', reason: err.message, stack: String(err.stack || '').slice(0, 1000) }
      }
    }, resumeData)
    log(`Rule-based result: ${JSON.stringify(ruleResult)}`)

    // Debug snapshot on non-applied outcomes: which fields remain, any error messages
    if (ruleResult.status !== 'applied') {
      const debug = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')]
        const unfilled = inputs
          .filter(i => i.offsetParent !== null)
          .filter(i => {
            if (i.tagName === 'SELECT') return i.selectedIndex <= 0
            if (i.type === 'checkbox' || i.type === 'radio') return false
            return !i.value || !i.value.trim()
          })
          .map(i => {
            const labelEl = i.id ? document.querySelector(`label[for="${i.id}"]`) : null
            const label = labelEl?.textContent.trim() || i.closest('label')?.textContent.trim() || i.name || i.id || i.placeholder || i.getAttribute('aria-label') || '(unknown)'
            const required = i.hasAttribute('required') || i.getAttribute('aria-required') === 'true'
            return `${i.tagName.toLowerCase()}${i.type ? '[' + i.type + ']' : ''} "${String(label).slice(0, 60)}"${required ? ' [REQUIRED]' : ''}`
          })
        const errorMsgs = [...document.querySelectorAll('[class*="error"], [role="alert"], [aria-invalid="true"]')]
          .filter(e => e.offsetParent !== null && e.textContent.trim().length > 0 && e.textContent.trim().length < 200)
          .map(e => e.textContent.trim())
          .slice(0, 10)
        return { unfilled, errorMsgs, url: location.href }
      })
      log(`Unfilled fields (${debug.unfilled.length}):`)
      debug.unfilled.forEach(f => log(`  • ${f}`))
      if (debug.errorMsgs.length) {
        log(`Visible error messages:`)
        debug.errorMsgs.forEach(m => log(`  ! ${m}`))
      }
      log(`Current URL: ${debug.url}`)
    }

    let finalResult = ruleResult

    // Level 2: AI guide-form
    if (useAI && (ruleResult.status === 'needs_review' || ruleResult.status === 'failed')) {
      log('Trying Level 2: AI guide-form...')
      const screenshotBase64 = (await page.screenshot({ type: 'png' })).toString('base64')
      const domSnippet = await page.evaluate(() => window.__jobflowATS.captureDomSnippet(6000))
      const guidance = await callApi('/auto-apply/guide-form', {
        url: page.url(), screenshotBase64, domSnippet, resumeData,
      })
      log(`Guidance: ${JSON.stringify(guidance).slice(0, 400)}`)
      if (guidance?.fields?.length) {
        const fillRes = await page.evaluate(async fields => window.__jobflowATS.executeFieldInstructions(fields), guidance.fields)
        log(`Executed ${fillRes.filled}/${guidance.fields.length} fields (errors: ${fillRes.errors.length})`)
        if (guidance.submitSelector) {
          const ok = await page.evaluate(sel => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true }, guidance.submitSelector)
          log(`Submit via guidance: ${ok ? 'clicked' : 'not found'}`)
          if (ok) {
            await page.waitForTimeout(4000)
            const body = (await page.evaluate(() => document.body.innerText)).toLowerCase()
            if (body.includes('thank') || body.includes('submitted') || body.includes('received')) {
              finalResult = { status: 'applied', reason: 'ai_guide_submit' }
            }
          }
        }
      }
    }

    // Level 3: agent loop
    if (useAI && finalResult.status === 'failed') {
      log('Trying Level 3: agent loop (up to 6 steps)...')
      const history = []
      for (let step = 1; step <= 6; step++) {
        const screenshotBase64 = (await page.screenshot({ type: 'png' })).toString('base64')
        const decision = await callApi('/auto-apply/agent-step', {
          url: page.url(), screenshotBase64, goal: 'submit this job application',
          history, resumeData, maxStep: 6, currentStep: step,
        })
        log(`Agent step ${step}: ${JSON.stringify(decision).slice(0, 200)}`)
        if (!decision?.action) break
        if (decision.action === 'done') { finalResult = { status: 'applied', reason: `agent_done: ${decision.reason}` }; break }
        if (decision.action === 'fail') { finalResult = { status: 'failed', reason: `agent_gaveup: ${decision.reason}` }; break }
        if (decision.action === 'wait') { await page.waitForTimeout(decision.ms || 1500); history.push({ action: 'wait', reason: decision.reason || '', ok: true }); continue }
        const res = await page.evaluate(async step => window.__jobflowATS.executeAction(step), decision)
        history.push({ action: `${decision.action} ${decision.selector || ''}`, reason: decision.reason || '', ok: !!res?.ok })
        await page.waitForTimeout(1200)
      }
    }

    // Level 1: diagnose on any remaining failure
    if (useAI && finalResult.status === 'failed') {
      log('Diagnosing failure...')
      const screenshotBase64 = (await page.screenshot({ type: 'png' })).toString('base64')
      const domSnippet = await page.evaluate(() => window.__jobflowATS.captureDomSnippet(6000))
      const diag = await callApi('/auto-apply/diagnose', {
        url: page.url(), screenshotBase64, domSnippet,
        ruleBasedReason: finalResult.reason, attempted: 'ats_form',
      })
      log(`Diagnosis: ${JSON.stringify(diag)}`)
      finalResult.diagnosis = diag
    }

    console.log('\n=============================================')
    console.log('FINAL RESULT:', JSON.stringify(finalResult, null, 2))
    console.log('=============================================\n')
  } finally {
    if (keepOpen) {
      log('--keep-open: press Ctrl+C to exit')
      await new Promise(() => {})
    } else {
      await browser.close()
    }
  }
}

main().catch(err => {
  console.error('Harness crashed:', err)
  process.exit(1)
})
