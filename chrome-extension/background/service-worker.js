import { fetchSavedApplications, fetchResumeData, updateStatus, checkLinkedInSession, triggerServerAutoApply, pollAutoApplyStatus, diagnoseFailure, domStep, pushExtensionLogs, fetchRecipes, captureFailure, diagnoseFailureById, fetchAutoApplyFilter } from '../lib/api-client.js'
import { API_BASE } from '../lib/config.js'

// ---------------------------------------------------------------------------
// Client-side apply — opens a tab, injects agent.js, runs DOM-based AI loop
// ---------------------------------------------------------------------------

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise(resolve => {
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated)
        resolve(true)
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve(false)
    }, timeoutMs)
  })
}

function sendTabMessage(tabId, message, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('content_script_timeout')), timeoutMs)
    chrome.tabs.sendMessage(tabId, message, response => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(response)
    })
  })
}

// Compressed viewport capture (JPEG quality 40 → typically 30-80KB)
async function captureTabScreenshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab?.windowId) { await addLog(`  📸 capture: no windowId`); return null }
    // Ensure tab is focused/active so captureVisibleTab can see it
    try { await chrome.windows.update(tab.windowId, { focused: true }) } catch {}
    try { await chrome.tabs.update(tabId, { active: true }) } catch {}
    await new Promise(r => setTimeout(r, 400))
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 40 })
    await addLog(`  📸 capture: ${dataUrl ? Math.round(dataUrl.length / 1024) + 'KB' : 'empty'}`)
    return dataUrl || null
  } catch (err) {
    await addLog(`  📸 capture failed: ${err.message}`)
    return null
  }
}

// Check pageState for filter-defined skip conditions during the flow.
// Returns null if pass, or { reason } if should bail.
function midFlowFilterCheck(pageState, filter) {
  if (!filter) return null
  const labels = (pageState?.fields || []).map(f => String(f.label || '').toLowerCase())
  const allLabels = labels.join(' | ')
  // Cover letter
  if (filter.skipIfCoverLetter && /\b(cover letter|motivation letter|why are you|in your own words|tell us about yourself)\b/i.test(allLabels)) {
    return { reason: 'filter: cover letter required' }
  }
  // Essay (long textarea OR essay-style question)
  if (filter.skipIfEssay) {
    const hasEssay = (pageState?.fields || []).some(f =>
      f.type === 'textarea' && /\b(why|describe|explain|tell us|elaborate|reason)\b/i.test(String(f.label || ''))
    )
    if (hasEssay) return { reason: 'filter: essay question detected' }
  }
  // Salary minimum check via bodyText
  if (filter.salaryMin && filter.salaryMin > 0) {
    const text = String(pageState?.bodyText || '')
    // Match patterns like "USD 50,000", "$50000", "Rp 10.000.000", "IDR 50000000"
    const matches = text.match(/(?:USD|US\$|\$|EUR|€|GBP|£|SGD|S\$|IDR|Rp\.?)\s?([\d,. ]{4,16})/gi) || []
    for (const m of matches) {
      const num = Number(m.replace(/[^\d]/g, ''))
      if (num > 0 && num < filter.salaryMin / 5) {
        // Heuristic: a salary much below filter.salaryMin (5x lower = clearly below) → bail
        return { reason: `filter: salary ${m.trim()} below min ${filter.salaryMin}` }
      }
    }
  }
  return null
}

async function runApplyAgent(tabId, applyUrl, resumeData, maxSteps = 20, filter = null) {
  // Upload resume first if available
  try {
    await sendTabMessage(tabId, { action: 'UPLOAD_RESUME', resumeUrl: resumeData.resumeUrl }, 15000)
  } catch {}

  const history = []
  // Per-attempt documentation (pushed as metadata on a single log entry at end of job)
  const qa = []  // { step, label, value, source, selector }
  let confirmationScreenshot = null
  let lastSeenPageState = null

  for (let step = 1; step <= maxSteps; step++) {
    let pageState
    try {
      pageState = await sendTabMessage(tabId, { action: 'GET_PAGE_STATE' }, 20000)
    } catch (err) {
      return { status: 'failed', reason: `get_page_state_failed: ${err.message}`, doc: { qa, lastSeenPageState } }
    }
    if (!pageState) return { status: 'failed', reason: 'no_page_state', doc: { qa, lastSeenPageState } }
    lastSeenPageState = pageState

    // Mid-flow filter check (cover letter / essay / salary minimum)
    const skipCheck = midFlowFilterCheck(pageState, filter)
    if (skipCheck) {
      await addLog(`  ⏭ Mid-flow skip: ${skipCheck.reason}`)
      return { status: 'needs_review', reason: skipCheck.reason, doc: { qa, lastSeenPageState } }
    }

    await addLog(`  🤖 Step ${step}/${maxSteps} — ${pageState.fields.length} fields, ${pageState.buttons.map(b => b.text).join(' | ')}`)

    const decision = await domStep({ url: applyUrl, pageState, resumeData, history, currentStep: step, maxStep: maxSteps })

    // Record Q&A for this step (match action.selector to field label)
    if (decision.actions?.length > 0) {
      const fieldBySelector = new Map(pageState.fields.map(f => [f.selector, f]))
      for (const a of decision.actions) {
        if (a.action === 'type' || a.action === 'select' || a.action === 'check') {
          const f = fieldBySelector.get(a.selector)
          qa.push({
            step,
            label: f?.label || a.selector,
            value: String(a.value ?? (a.action === 'check' ? 'checked' : '')),
            selector: a.selector,
            source: a.source || 'ai',
          })
        }
      }
    }

    if (decision.status === 'done') {
      confirmationScreenshot = await captureTabScreenshot(tabId)
      return { status: 'applied', reason: decision.reason || 'agent_done', doc: { qa, lastSeenPageState, confirmationScreenshot } }
    }
    if (decision.status === 'fail') return { status: 'failed', reason: `agent: ${decision.reason || 'fail'}`, doc: { qa, lastSeenPageState } }

    if (decision.actions?.length > 0) {
      const prevUrl = (await chrome.tabs.get(tabId)).url
      const results = await sendTabMessage(tabId, { action: 'EXECUTE_ACTIONS', actions: decision.actions }, 15000).catch(() => [])
      history.push({ step, actions: decision.actions, results })

      // Detect Submit click: capture screenshot immediately after, then wait for confirmation
      const clickedSubmit = decision.actions.some(a =>
        a.action === 'click' && pageState.buttons.some(b =>
          b.selector === a.selector && /submit application|send application|submit my application/i.test(b.text)
        )
      )

      if (clickedSubmit) {
        // Give LinkedIn/ATS time to render confirmation before the modal auto-closes
        await new Promise(r => setTimeout(r, 3500))
        confirmationScreenshot = await captureTabScreenshot(tabId)
        // Treat as success — LinkedIn closes modal quickly, next scan would miss confirmation
        return { status: 'applied', reason: 'submit_clicked', doc: { qa, lastSeenPageState, confirmationScreenshot } }
      }

      // If the page navigated (e.g. external ATS redirect), re-inject agent.js
      await new Promise(r => setTimeout(r, 1500))
      const newUrl = (await chrome.tabs.get(tabId)).url
      if (newUrl !== prevUrl) {
        await addLog(`  ↪ Navigated to ${new URL(newUrl).hostname} — re-injecting agent`)
        await waitForTabLoad(tabId)
        await chrome.scripting.executeScript({ target: { tabId }, func: (base) => { window.__jobflowApiBase = base }, args: [API_BASE] })
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content/agent.js'] })
        await new Promise(r => setTimeout(r, 1000))
      }
    } else {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  return { status: 'needs_review', reason: 'agent: max_steps_reached', doc: { qa, lastSeenPageState } }
}

async function applyViaClientSide(app, resumeData, filter = null) {
  const applyUrl = app.job?.applyUrl

  // Self-heal: check if a recipe says to skip this URL pattern
  try {
    const recipes = await fetchRecipes(applyUrl)
    const skipRecipe = recipes.find(r => r.skipSite)
    if (skipRecipe) {
      await addLog(`  ⏭ Recipe skip: ${skipRecipe.reason || skipRecipe.urlPattern} (confidence ${skipRecipe.confidence || '—'}%)`)
      return { status: 'needs_review', reason: `recipe_skip: ${skipRecipe.reason || skipRecipe.urlPattern}` }
    }
  } catch {}

  let tab = null

  try {
    tab = await chrome.tabs.create({ url: applyUrl, active: false })
    await waitForTabLoad(tab.id)
    await chrome.tabs.update(tab.id, { active: true })
    await new Promise(r => setTimeout(r, 2000))

    // Inject universal agent script, pass API_BASE so it doesn't need import
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (base) => { window.__jobflowApiBase = base }, args: [API_BASE] })
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/agent.js'] })
    await new Promise(r => setTimeout(r, 1000))

    const result = await runApplyAgent(tab.id, applyUrl, resumeData, 20, filter)
    return result || { status: 'failed', reason: 'no_response' }
  } catch (err) {
    return { status: 'failed', reason: err.message || 'client_apply_error' }
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id) } catch {}
    }
  }
}

// Global error handlers — capture crash errors before service worker dies
self.addEventListener('error', (event) => {
  const error = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
  chrome.storage.session.set({ lastCrashError: { error, stack: event.error?.stack || '', timestamp: Date.now() } })
})

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const error = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack || '' : ''
  chrome.storage.session.set({ lastCrashError: { error, stack, timestamp: Date.now() } })
})

const LAST_UPDATED = '2026-04-23 11:15'

const JOB_DELAY_MIN = 30000
const JOB_DELAY_MAX = 90000
const MAX_RETRIES = 3
const RETRY_BACKOFF = [3000, 9000, 27000] // exponential backoff

// Permanent errors — never retry these, they need human intervention
const PERMANENT_ERRORS = [
  'no_apply_url',
  'login_required',
  'no_apply_option_found',
  'too_many_steps',
  'iframe_detected',
  'requires_auth',
  'external_ats',
]

function isPermanentError(reason) {
  if (!reason) return false
  return PERMANENT_ERRORS.some(e => reason.includes(e))
}

function randomDelay(min = JOB_DELAY_MIN, max = JOB_DELAY_MAX) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function getState() {
  return chrome.storage.local.get(['isRunning', 'queue', 'currentIndex', 'results', 'logs', 'dailyLimit', 'resumeData', 'retryQueue'])
}

async function setState(updates) {
  await chrome.storage.local.set(updates)
}

let sessionStartTime = null
let currentAppId = null // tagged onto remote logs while processing a specific job

// ---- Permanent activity log (stored locally, never flushed) ----

async function getActiveBatchId() {
  const { activeBatchId } = await chrome.storage.local.get('activeBatchId')
  return activeBatchId || null
}

async function generateBatchId() {
  const id = (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await chrome.storage.local.set({ activeBatchId: id })
  return id
}

async function queueRemoteLog(message, level = 'info', applicationId = null, metadata = null) {
  try {
    const batchId = await getActiveBatchId()
    if (!batchId) return
    const entry = {
      batchId,
      level,
      message,
      applicationId: applicationId || currentAppId || null,
      createdAt: new Date().toISOString(),
    }
    if (metadata) entry.metadata = metadata
    pushExtensionLogs([entry]).catch(() => {})
  } catch {}
}

function formatRuntime(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m}m${rs}s`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h${rm}m${rs}s`
}

async function addLog(msg, meta = {}) {
  const { logs = [] } = await chrome.storage.local.get('logs')
  const time = new Date().toLocaleTimeString('id-ID')
  const runtime = sessionStartTime ? ` +${formatRuntime(Date.now() - sessionStartTime)}` : ''
  logs.push(`[${time}${runtime}] ${msg}`)
  if (logs.length > 50) logs.splice(0, logs.length - 50)
  await setState({ logs })
  // Mirror to server DB (best-effort, buffered)
  queueRemoteLog(msg, meta.level || 'info', meta.applicationId || null, meta.metadata || null)
}

// Lowercase substring contains-any check
function anyContains(haystack, needles) {
  if (!Array.isArray(needles) || needles.length === 0) return null  // null = no rule
  const h = String(haystack || '').toLowerCase()
  return needles.some(n => h.includes(String(n).toLowerCase()))
}

function passesPreflightFilter(job, filter) {
  if (!filter) return { pass: true }
  const title = job?.title || ''
  const company = job?.company || ''
  const location = job?.location || ''

  // Title include: at least one keyword must match (kosong = no rule)
  if (filter.titleInclude?.length > 0) {
    const hit = anyContains(title, filter.titleInclude)
    if (!hit) return { pass: false, reason: `title-include miss: "${title}"` }
  }
  // Title exclude: skip if any matches
  if (filter.titleExclude?.length > 0 && anyContains(title, filter.titleExclude)) {
    return { pass: false, reason: `title-exclude hit: "${title}"` }
  }
  // Company blacklist
  if (filter.companyBlacklist?.length > 0 && anyContains(company, filter.companyBlacklist)) {
    return { pass: false, reason: `company blacklisted: ${company}` }
  }
  // Country whitelist
  if (filter.countryWhitelist?.length > 0) {
    const hit = anyContains(location, filter.countryWhitelist)
    if (!hit && !(filter.allowRemote && /remote/i.test(location))) {
      return { pass: false, reason: `country not in whitelist: "${location}"` }
    }
  }
  // Country blacklist
  if (filter.countryBlacklist?.length > 0 && anyContains(location, filter.countryBlacklist)) {
    return { pass: false, reason: `country blacklisted: "${location}"` }
  }
  // Easy Apply only
  if (filter.easyApplyOnly && !job?.applyUrl?.includes('linkedin.com')) {
    return { pass: false, reason: 'easyApplyOnly: non-LinkedIn URL' }
  }
  return { pass: true }
}

function isWithinActiveTime(filter) {
  if (!filter) return true
  const now = new Date()
  const hour = now.getHours()
  const day = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()]
  if (filter.activeDays?.length > 0 && !filter.activeDays.includes(day)) return false
  const start = filter.activeHourStart ?? 0
  const end = filter.activeHourEnd ?? 23
  return hour >= start && hour <= end
}

async function startAutoApply() {
  // Prevent duplicate starts
  const { isRunning } = await chrome.storage.local.get('isRunning')
  if (isRunning) return

  sessionStartTime = Date.now()
  await setState({ logs: [] })
  const batchId = await generateBatchId()
  await addLog(`Batch started: ${batchId}`)
  await addLog('Fetching applications, resume, & filters...')

  let applications, resumeData, filter
  try {
    [applications, resumeData, filter] = await Promise.all([
      fetchSavedApplications(),
      fetchResumeData(),
      fetchAutoApplyFilter(),
    ])
  } catch (err) {
    await addLog(`Error: ${err.message}`)
    return
  }

  // Time gating
  if (!isWithinActiveTime(filter)) {
    await addLog(`⏸ Outside active hours/days (${filter?.activeHourStart}–${filter?.activeHourEnd}, ${(filter?.activeDays || []).join(',') || 'any'}). Stopped.`)
    return
  }

  if (applications.length === 0) {
    await addLog('No saved jobs to apply')
    return
  }

  // Pre-flight filter
  const preFilterCount = applications.length
  if (filter) {
    const filtered = []
    const stripped = []
    for (const app of applications) {
      const r = passesPreflightFilter(app.job, filter)
      if (r.pass) filtered.push(app)
      else stripped.push({ title: app.job?.title, reason: r.reason })
    }
    if (stripped.length > 0) {
      await addLog(`📋 Filter: ${preFilterCount} → ${filtered.length} jobs (${stripped.length} excluded)`)
      stripped.slice(0, 3).forEach(s => addLog(`  ✗ ${s.title}: ${s.reason}`))
    }
    applications = filtered
  }

  if (applications.length === 0) {
    await addLog('No jobs left after filter')
    return
  }

  // Persist filter for processNextJob to consume
  await chrome.storage.local.set({ activeFilter: filter || null })

  // Fix 1: Session pre-check — verify LinkedIn is logged in before wasting the whole batch
  const hasLinkedIn = applications.some(a => a.job?.applyUrl?.includes('linkedin.com'))
  if (hasLinkedIn) {
    await addLog('Checking LinkedIn session...')
    const isLoggedIn = await checkLinkedInSession()
    if (!isLoggedIn) {
      await addLog('❌ LinkedIn not logged in! Please log in to LinkedIn first, then try again.')
      return
    }
    await addLog('✅ LinkedIn session active')
  }

  // Use filter's maxPerDay if set, else fall back to popup setting
  const { dailyLimit = 20 } = await chrome.storage.local.get('dailyLimit')
  const effectiveLimit = filter?.maxPerDay ?? dailyLimit
  const queue = applications.slice(0, effectiveLimit)
  if (effectiveLimit < applications.length) {
    await addLog(`📋 Daily cap: ${effectiveLimit}/${applications.length}`)
  }

  await setState({
    isRunning: true,
    queue,
    currentIndex: 0,
    results: { applied: 0, skipped: 0, failed: 0 },
    retryQueue: [], // Fix 4: retry queue
    resumeData,
  })

  await addLog(`Found ${queue.length} jobs. Resume loaded. Starting...`)
  processNextJob()
}

async function stopAutoApply() {
  await setState({ isRunning: false })
  await addLog('Stopped by user')
}


async function processNextJob() {
  try {
    await _processNextJob()
  } catch (err) {
    const error = err.message || String(err)
    const stack = err.stack || ''
    chrome.storage.session.set({ lastCrashError: { error, stack, timestamp: Date.now() } })
    await addLog(`💥 Uncaught error: ${error}`)
    // Let crash recovery handle it
    throw err
  }
}

async function _processNextJob() {
  const state = await getState()
  if (!state.isRunning) return

  const { queue = [], currentIndex = 0, results = { applied: 0, skipped: 0, failed: 0 }, resumeData } = state
  if (currentIndex >= queue.length) {
    // Fix 4: Process retry queue before finishing
    const { retryQueue = [] } = await chrome.storage.local.get('retryQueue')
    if (retryQueue.length > 0) {
      const retryItem = retryQueue.shift()
      const retryCount = retryItem._retryCount || 1
      const backoffMs = RETRY_BACKOFF[retryCount - 1] || RETRY_BACKOFF[RETRY_BACKOFF.length - 1]
      await addLog(`\n🔄 Retry queue: ${retryQueue.length + 1} jobs remaining. Retrying in ${Math.round(backoffMs / 1000)}s...`)
      // Put retry item back in queue as the only item, reset index
      await setState({
        queue: [retryItem],
        currentIndex: 0,
        retryQueue,
      })
      chrome.alarms.create('nextJob', { delayInMinutes: backoffMs / 60000 })
      return
    }

    await setState({ isRunning: false, retryQueue: [] })
    currentAppId = null
    await addLog(`Done! Applied: ${results.applied}, Skipped: ${results.skipped}, Failed: ${results.failed}`)
    return
  }

  const app = queue[currentIndex]
  const jobTitle = app.job?.title || 'Unknown'
  const company = app.job?.company || ''
  const applyUrl = app.job?.applyUrl
  currentAppId = app.id || null

  await addLog(`[${currentIndex + 1}/${queue.length}] ${jobTitle} @ ${company}`)

  if (!applyUrl) {
    await addLog('  ❌ No apply URL (permanent)')
    await updateStatus(app.id, 'saved', '[auto-apply error] no_apply_url (permanent)')
    results.failed++
    await setState({ currentIndex: currentIndex + 1, results })
    scheduleNext()
    return
  }

  let result
  // Load active filter (set during startAutoApply) for mid-flow checks
  const { activeFilter = null } = await chrome.storage.local.get('activeFilter')

  try {
    const isLinkedIn = applyUrl.includes('linkedin.com')
    if (isLinkedIn) {
      // LinkedIn blocks server IP — always client-side
      await addLog('  → Client-side apply (LinkedIn)...')
      result = await applyViaClientSide(app, resumeData, activeFilter)
    } else {
      // Non-LinkedIn — try server first, fallback to client-side
      await addLog('  → Sending to server auto-apply...')
      const triggerRes = await triggerServerAutoApply(app.id)
      if (!triggerRes.success) {
        await addLog(`  ⚠️ Server rejected: ${triggerRes.error?.code || 'unknown'} — falling back to client-side...`)
        result = await applyViaClientSide(app, resumeData, activeFilter)
      } else {
        await addLog('  → Server processing... polling status')
        result = await pollAutoApplyStatus(app.id, 120000)
        if (result.status === 'failed' && !isPermanentError(result.reason)) {
          await addLog(`  ⚠️ Server failed: ${result.reason} — trying client-side...`)
          result = await applyViaClientSide(app, resumeData, activeFilter)
        }
      }
    }
  } catch (err) {
    result = { status: 'failed', reason: err.message || 'unknown_error' }
  }

  // Process result
  if (!result) result = { status: 'failed', reason: 'no_response' }

  const { retryQueue = [] } = await chrome.storage.local.get('retryQueue')

  if (result.status === 'applied') {
    await updateStatus(app.id, 'applied')
    results.applied++
    // Documentation bundle: questions/answers, confirmation screenshot, resume used
    const doc = result.doc || {}
    await addLog(`  ✅ Applied${result.reason ? ` (${result.reason})` : ''}`, {
      metadata: {
        kind: 'apply_attempt',
        jobTitle,
        company,
        applyUrl,
        finalUrl: doc.lastSeenPageState?.url || applyUrl,
        questions: (doc.qa || []).slice(0, 40),
        resumeUsed: {
          url: resumeData?.resumeUrl || null,
          firstName: resumeData?.firstName, lastName: resumeData?.lastName,
          email: resumeData?.email,
        },
        confirmationScreenshot: doc.confirmationScreenshot || null,
      },
    })
  } else if (result.status === 'needs_review') {
    // Needs review = user intervention required, don't retry
    await updateStatus(app.id, 'saved', `[auto-apply skip] ${result.reason || 'unknown'}`)
    results.skipped++
    await addLog(`  ⏭ Needs review: ${result.reason || 'unknown'}`)
    // Self-heal capture + diagnose (non-blocking)
    captureSelfHealFailure(app, applyUrl, result).catch(() => {})
  } else {
    // Failed — classify error before deciding retry
    const reason = result.reason || 'unknown'
    const retryCount = app._retryCount || 0

    // Surface AI diagnosis to both popup log and server metadata
    if (result.diagnosis) {
      const d = result.diagnosis
      await addLog(
        `  🔍 AI diagnosis: ${d.rootCause || 'unknown'} — ${d.specifics || ''}`,
        { level: 'warn', metadata: { diagnosis: d, reason } }
      )
      if (d.fixSuggestion) await addLog(`     Fix idea: ${d.fixSuggestion}`, { metadata: { diagnosis: d } })
    }

    if (isPermanentError(reason)) {
      // Permanent error — skip retry, mark as failed immediately
      await updateStatus(app.id, 'saved', `[auto-apply error] ${reason} (permanent)`)
      results.failed++
      await addLog(`  ❌ Permanent failure: ${reason} — no retry`, { level: 'error', metadata: result.diagnosis ? { diagnosis: result.diagnosis } : null })
    } else if (retryCount < MAX_RETRIES && !(result.diagnosis && result.diagnosis.canRetry === false)) {
      // Transient error — add to retry queue (but respect AI's "don't retry" verdict)
      retryQueue.push({ ...app, _retryCount: retryCount + 1, _retryReason: reason })
      await addLog(`  ⚠️ Failed: ${reason} — will retry (${retryCount + 1}/${MAX_RETRIES})`, { level: 'warn' })
    } else {
      await updateStatus(app.id, 'saved', `[auto-apply error] ${reason}${result.diagnosis ? ` | ${result.diagnosis.rootCause}` : ''}`)
      results.failed++
      const tailReason = result.diagnosis?.canRetry === false ? ' (AI: no retry)' : ` (after ${MAX_RETRIES} retries)`
      await addLog(`  ❌ Failed${tailReason}: ${reason}`, { level: 'error', metadata: result.diagnosis ? { diagnosis: result.diagnosis } : null })
      // Self-heal capture + diagnose
      captureSelfHealFailure(app, applyUrl, result).catch(() => {})
    }
  }

  await setState({ currentIndex: currentIndex + 1, results, retryQueue })

  // Persist checkpoint to session storage for crash recovery
  // chrome.storage.session survives service worker restarts within browser session
  try {
    chrome.storage.session.set({
      checkpoint: {
        currentIndex: currentIndex + 1,
        results,
        retryQueueMeta: retryQueue.map(a => ({ id: a.id, retryCount: a._retryCount })),
        crashCount: 0,
        lastCrashIndex: -1,
        sessionStartTime,
        timestamp: Date.now(),
      }
    })
  } catch {}

  currentAppId = null
  // Fail-fast: only apply the anti-bot cool-down after a real submit. If the job bailed
  // without submitting anything (no_apply_mechanism, already_applied, page errors),
  // move to the next job quickly — LinkedIn's rate-limiter keys on submits, not on tab opens.
  scheduleNext(result.status === 'applied')
}


// Self-heal: after a failed/skipped job, capture context and run AI diagnosis.
// If diagnosis is high-confidence "skip_site", a recipe is auto-generated server-side,
// and future runs will short-circuit this URL pattern.
async function captureSelfHealFailure(app, applyUrl, result) {
  if (!applyUrl) return
  const { activeBatchId } = await chrome.storage.local.get('activeBatchId').catch(() => ({}))
  const historySnippet = {
    reason: result?.reason,
    diagnosis: result?.diagnosis || null,
    doc: result?.doc ? {
      qa: (result.doc.qa || []).slice(-5),
      lastUrl: result.doc.lastSeenPageState?.url,
      lastFields: (result.doc.lastSeenPageState?.fields || []).slice(0, 5).map(f => ({ label: f.label, type: f.type, value: (f.value || '').slice(0, 40) })),
      lastButtons: (result.doc.lastSeenPageState?.buttons || []).slice(0, 10).map(b => b.text),
    } : null,
  }
  const domSnippet = result?.doc?.lastSeenPageState?.bodyText?.slice(0, 2500) || null
  const captured = await captureFailure({
    batchId: activeBatchId || null,
    applicationId: app?.id || null,
    url: applyUrl,
    reason: result?.reason || 'unknown',
    historySnippet,
    domSnippet,
    screenshot: result?.doc?.confirmationScreenshot || null,
  })
  if (captured?.failureId) {
    addLog(`  📋 Failure captured (${captured.failureId.slice(0, 8)}) — pattern: ${captured.hostPattern}`)
    // Trigger diagnose asynchronously — if recipe is auto-created, next same-pattern job skips
    diagnoseFailureById(captured.failureId).then(d => {
      if (d?.diagnosis) {
        const conf = d.diagnosis.confidence || 0
        const cat = d.diagnosis.fixCategory || 'unknown'
        addLog(`  🧠 AI diagnose: ${d.diagnosis.rootCause || '—'} [${cat}, ${conf}%]${d.recipeId ? ' → recipe auto-created' : ''}`)
      }
    }).catch(() => {})
  }
}

function scheduleNext(didSubmit = false) {
  const delay = didSubmit ? randomDelay() : randomDelay(3000, 6000)
  const seconds = Math.round(delay / 1000)
  chrome.alarms.create('nextJob', { delayInMinutes: delay / 60000 })
  addLog(`  ⏳ Next in ${seconds}s${didSubmit ? '' : ' (fast — no submit)'}`)
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'nextJob') processNextJob()
})

// Crash recovery: check if there's an interrupted session on startup
const MAX_CRASHES_PER_JOB = 2

async function checkCrashRecovery() {
  const state = await getState()
  if (state.isRunning) {
    // Service worker restarted while running — this means a crash happened
    // Restore session start time from checkpoint if available
    try {
      const { checkpoint: cp } = await chrome.storage.session.get('checkpoint')
      sessionStartTime = cp?.sessionStartTime || Date.now()
    } catch { sessionStartTime = Date.now() }
    await addLog('⚠️ Recovered from crash. Checking checkpoint...')
    try {
      // Show the error that caused the crash
      const { lastCrashError } = await chrome.storage.session.get('lastCrashError')
      if (lastCrashError) {
        await addLog(`💥 Crash error: ${lastCrashError.error}`)
        if (lastCrashError.stack) {
          // Log first 2 lines of stack trace
          const stackLines = lastCrashError.stack.split('\n').slice(0, 3).join(' | ')
          await addLog(`   Stack: ${stackLines}`)
        }
        chrome.storage.session.remove('lastCrashError')
      }
      const { checkpoint } = await chrome.storage.session.get('checkpoint')
      if (checkpoint && (Date.now() - checkpoint.timestamp) < 30 * 60 * 1000) {
        // Track how many times we've crashed on the same job index
        const crashCount = (checkpoint.crashCount || 0) + 1
        const isSameJob = checkpoint.lastCrashIndex === checkpoint.currentIndex

        if (isSameJob && crashCount >= MAX_CRASHES_PER_JOB) {
          // This job keeps crashing — skip it
          const { queue = [] } = state
          const skippedJob = queue[checkpoint.currentIndex]
          const jobTitle = skippedJob?.job?.title || 'Unknown'
          const crashError = lastCrashError?.error || 'unknown'
          await addLog(`⏭ Skipping "${jobTitle}" — crashed ${crashCount}x: ${crashError}`)

          const results = checkpoint.results || { applied: 0, skipped: 0, failed: 0 }
          results.failed++

          if (skippedJob?.id) {
            await updateStatus(skippedJob.id, 'saved', `[auto-apply error] repeated_crash (${crashCount}x): ${crashError}`)
          }

          const nextIndex = checkpoint.currentIndex + 1
          await setState({ currentIndex: nextIndex, results })
          // Update checkpoint so next crash doesn't re-count
          chrome.storage.session.set({
            checkpoint: { currentIndex: nextIndex, results, crashCount: 0, lastCrashIndex: -1, sessionStartTime, timestamp: Date.now() }
          })
          processNextJob()
          return
        }

        // Resume from checkpoint, but record crash count
        await addLog(`🔄 Resuming from job ${checkpoint.currentIndex + 1}...`)
        await setState({ currentIndex: checkpoint.currentIndex, results: checkpoint.results })
        chrome.storage.session.set({
          checkpoint: {
            ...checkpoint,
            crashCount: isSameJob ? crashCount : 1,
            lastCrashIndex: checkpoint.currentIndex,
            timestamp: Date.now(),
          }
        })
        processNextJob()
        return
      }
    } catch {}

    // Too old or no checkpoint — stop gracefully
    const { results = { applied: 0, skipped: 0, failed: 0 } } = state
    await setState({ isRunning: false })
    await addLog(`⏹ Session ended (crash recovery). Applied: ${results.applied}, Skipped: ${results.skipped}, Failed: ${results.failed}`)
  }
}

checkCrashRecovery()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START') {
    startAutoApply().then(() => sendResponse({ ok: true }))
    return true
  }
  if (message.action === 'STOP') {
    stopAutoApply().then(() => sendResponse({ ok: true }))
    return true
  }
  if (message.action === 'GET_STATE') {
    getState().then(state => sendResponse({ ...state, lastUpdated: LAST_UPDATED }))
    return true
  }
})
