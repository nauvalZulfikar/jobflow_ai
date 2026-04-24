// E2E dry-run: connect to user's Chrome via CDP (port 9222),
// drive extension through Easy Apply flow, STOP at Submit button.
// Does NOT click Submit — captures final state for review.

import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../../tmp/e2e-run')
mkdirSync(OUT_DIR, { recursive: true })

// Read agent.js and strip the double-load guard so we can re-inject on nav
const AGENT_PATH = resolve(__dirname, '../../chrome-extension/content/agent.js')
const AGENT_SRC = readFileSync(AGENT_PATH, 'utf8')
  .replace(/^if \(window\.__jobflowAgentLoaded\).*$/m, '')
  .replace(/^window\.__jobflowAgentLoaded = true$/m, '')

const PROD_USER_ID = 'cmng4rn8b0000hfw78sj6fb2n'
const SECRET = 'local-dev-secret-for-extension-log-testing-only'

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function makeToken() {
  const key = new TextEncoder().encode(SECRET)
  return await new SignJWT({ id: PROD_USER_ID })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
}

async function main() {
  log('connecting to Chrome CDP at localhost:9222...')
  const browser = await chromium.connectOverCDP('http://localhost:9222')
  const [context] = browser.contexts()
  if (!context) { log('no browser context — is Chrome running with --remote-debugging-port=9222?'); process.exit(1) }

  // 1. Verify LinkedIn session cookie
  const cookies = await context.cookies('https://www.linkedin.com')
  const liAt = cookies.find(c => c.name === 'li_at')
  if (!liAt) { log('❌ LinkedIn session cookie missing — login to LinkedIn first'); process.exit(1) }
  log(`✅ LinkedIn session present (expires ${new Date(liAt.expires * 1000).toISOString()})`)

  // 2. Generate API token (skip extension SW — drive flow directly via page.evaluate)
  const token = await makeToken()
  log(`✅ token generated (dry-run drives the extension's logic directly, no SW needed)`)

  // 3. Target a specific known-Easy-Apply job (from logged-in.html fixture — Data Scientist @ Sansaone)
  // Rewrite to /apply/ route — LinkedIn SPA doesn't open modal on click under automation.
  const rawUrl = process.env.TEST_URL || 'https://www.linkedin.com/jobs/view/4404736337/'
  const mLI = rawUrl.match(/^(https:\/\/www\.linkedin\.com\/jobs\/view\/\d+)\/?/i)
  const testUrl = mLI ? `${mLI[1]}/apply/?openSDUIApplyFlow=true` : rawUrl
  log(`test url (rewritten): ${testUrl}`)
  const testApp = { job: { title: 'known-Easy-Apply test job', company: '(fixture)', applyUrl: testUrl } }

  // 4. Open the job page
  const page = await context.newPage()
  // suppress LinkedIn's noisy ERR_FAILED (ads/tracking blocked) — only log real errors
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const txt = msg.text()
    if (/Failed to load resource|ERR_FAILED|ERR_BLOCKED/i.test(txt)) return
    log(`[page:error]`, txt.slice(0, 300))
  })
  await page.goto(testApp.job.applyUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // 5. Inject agent.js via page.evaluate (CDP Runtime.evaluate bypasses page CSP).
  // Wrap in IIFE so top-level declarations become locals, then expose via window.
  async function injectAgent() {
    const bootstrap = `
      window.__jobflowApiBase = 'http://localhost:3001/api';
      // Stub chrome.runtime for non-extension context
      if (typeof window.chrome === 'undefined') window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = { onMessage: { addListener: () => {} } };
      if (!window.chrome.storage) window.chrome.storage = { local: { get: async () => ({}), set: async () => {} } };
      (function() {
        ${AGENT_SRC}
        window.__jfGetPageState = getPageState;
        window.__jfExecuteActions = executeActions;
        window.__jfUploadResume = uploadResume;
      })();
    `
    await page.evaluate(bootstrap)
    await page.waitForTimeout(400)
  }
  await injectAgent()
  log('agent.js injected')

  // 6. Loop — same logic as service-worker.runApplyAgent
  const resumeDataRes = await fetch('http://localhost:3001/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const userData = (await resumeDataRes.json()).data
  const resumeRes = await fetch('http://localhost:3001/api/resume', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const resumeList = (await resumeRes.json()).data || []
  const defaultResume = resumeList.find(r => r.isDefault) || resumeList[0]
  const content = defaultResume?.content || {}
  const pi = content.personalInfo || {}
  const exps = Array.isArray(content.experience) ? content.experience : []
  const computeTotalYears = (experience) => {
    const parseMonth = (s) => {
      if (!s) return null
      const t = String(s).toLowerCase()
      if (t === 'present' || t === 'current' || t === 'now') return Date.now()
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d.getTime()
    }
    const ranges = experience
      .map(e => [parseMonth(e.startDate), parseMonth(e.endDate) ?? Date.now()])
      .filter(([a, b]) => a != null && b != null && b > a)
      .sort((x, y) => x[0] - y[0])
    if (ranges.length === 0) return 0
    let merged = [ranges[0].slice()]
    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1]
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1])
      else merged.push(ranges[i].slice())
    }
    const totalMs = merged.reduce((acc, [a, b]) => acc + (b - a), 0)
    return Math.max(0, Math.round(totalMs / (365.25 * 24 * 3600 * 1000)))
  }
  const resumeData = {
    firstName: pi.firstName || userData.name?.split(' ')[0] || '',
    lastName: pi.lastName || userData.name?.split(' ').slice(1).join(' ') || '',
    fullName: userData.name || '',
    email: pi.email || userData.email || '',
    phone: pi.phone || '',
    location: pi.location || '',
    city: pi.location?.split(',')[0]?.trim() || '',
    country: 'Indonesia',
    linkedin: pi.linkedinUrl || '',
    currentCompany: exps[0]?.company || '',
    currentTitle: exps[0]?.title || '',
    yearsExp: String(computeTotalYears(exps)),
    resumeUrl: defaultResume?.fileUrl || null,
    skills: Array.isArray(content.skills) ? content.skills : [],
    experience: exps.slice(0, 5).map(e => ({
      title: e.title || '',
      company: e.company || '',
      startDate: e.startDate || '',
      endDate: e.endDate || 'Present',
    })),
    education: (Array.isArray(content.education) ? content.education : []).slice(0, 3).map(e => ({
      school: e.school || '', degree: e.degree || '', field: e.field || '',
    })),
  }
  log(`resume: ${resumeData.firstName} ${resumeData.lastName} — ${resumeData.yearsExp}y exp, ${resumeData.skills.length} skills`)

  const MAX_STEPS = 10
  const history = []
  let finalState = null
  let prevStateHash = null
  let stuckCount = 0

  for (let step = 1; step <= MAX_STEPS; step++) {
    log(`\n--- Step ${step}/${MAX_STEPS} ---`)
    const state = await page.evaluate(async () => {
      return typeof window.__jfGetPageState === 'function' ? await window.__jfGetPageState() : null
    }).catch(err => { log(`getPageState threw: ${err.message}`); return null })
    if (!state) { log('❌ could not get page state'); break }
    log(`url: ${state.url}`)
    log(`modalOpen: ${state.modalOpen}, fields: ${state.fields.length}, buttons: ${state.buttons.length}`)
    state.buttons.slice(0, 10).forEach(b => log(`  btn: "${b.text}" (${b.selector})`))

    // Stuck detection: same state hash 2 steps in a row → bail
    const stateHash = JSON.stringify({
      u: state.url,
      f: state.fields.map(f => f.selector),
      b: state.buttons.map(b => b.selector),
    })
    if (stateHash === prevStateHash) {
      stuckCount++
      if (stuckCount >= 2) {
        log(`\n🛑 STUCK — state unchanged for ${stuckCount + 1} steps, bailing`)
        finalState = { reached: 'stuck', state, step }
        break
      }
    } else {
      stuckCount = 0
    }
    prevStateHash = stateHash

    // Screenshot at this step
    await page.screenshot({ path: resolve(OUT_DIR, `step-${step}.png`), fullPage: false })

    // FASE D: if we see a submit button, CLICK IT (user explicitly approved)
    const submitBtn = state.buttons.find(b => /submit application|submit my application|send application|^submit$|lamar/i.test(b.text))
    if (submitBtn) {
      log(`\n🎯 SUBMIT BUTTON DETECTED — "${submitBtn.text}" (${submitBtn.selector})`)
      if (process.env.DRY_RUN === '1') {
        log(`   DRY_RUN=1, not clicking`)
        finalState = { reached: 'submit_dry', state, step }
        break
      }
      log(`   🔴 CLICKING SUBMIT (Fase D)...`)
      await page.screenshot({ path: resolve(OUT_DIR, `before-submit.png`) })
      const clickRes = await page.evaluate(async (actions) => {
        return typeof window.__jfExecuteActions === 'function' ? await window.__jfExecuteActions(actions) : null
      }, [{ action: 'click', selector: submitBtn.selector }])
      log(`   submit click result: ${JSON.stringify(clickRes)}`)
      await page.waitForTimeout(5000)
      await page.screenshot({ path: resolve(OUT_DIR, `after-submit.png`) })
      const postState = await page.evaluate(async () => (typeof window.__jfGetPageState === 'function' ? await window.__jfGetPageState() : null))
      log(`   post-submit bodyText sample: "${(postState?.bodyText || '').slice(0, 200)}"`)
      finalState = { reached: 'submitted', state, postState, step }
      break
    }

    // Ask /dom-step for next actions
    const stepRes = await fetch('http://localhost:3001/api/auto-apply/dom-step', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: state.url, pageState: state, resumeData, history, currentStep: step, maxStep: MAX_STEPS }),
    })
    const decision = (await stepRes.json()).data
    log(`AI decision: status=${decision.status}, reason="${decision.reason}", actions=${decision.actions?.length || 0}`)
    decision.actions?.forEach(a => log(`  → ${a.action} ${a.selector}${a.value ? ` = "${a.value}"` : ''}`))

    if (decision.status === 'done') { finalState = { reached: 'done', state, decision, step }; break }
    if (decision.status === 'fail') { finalState = { reached: 'fail', state, decision, step }; break }

    if (decision.actions?.length > 0) {
      const prevUrl = state.url
      const results = await page.evaluate(async (actions) => {
        return typeof window.__jfExecuteActions === 'function' ? await window.__jfExecuteActions(actions) : []
      }, decision.actions).catch(err => { log(`executeActions threw: ${err.message}`); return [] })
      log(`  results: ${JSON.stringify(results).slice(0, 200)}`)
      history.push({ step, actions: decision.actions, results })
      await page.waitForTimeout(2000)

      const newUrl = page.url()
      if (newUrl !== prevUrl) {
        log(`↪ navigated to ${new URL(newUrl).hostname}`)
        await page.waitForLoadState('domcontentloaded').catch(() => {})
        await page.waitForTimeout(2000)
        await injectAgent()
      }
    } else {
      await page.waitForTimeout(1500)
    }
  }

  log('\n=== FINAL REPORT ===')
  log(JSON.stringify(finalState, null, 2).slice(0, 3000))
  writeFileSync(resolve(OUT_DIR, '_final.json'), JSON.stringify({ finalState, history }, null, 2))
  log(`\nScreenshots + final state saved to: ${OUT_DIR}`)

  // Keep browser open for manual inspection
  log('\n(leaving browser open for review)')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
