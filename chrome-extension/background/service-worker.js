import { fetchSavedApplications, fetchResumeData, updateStatus, checkLinkedInSession, triggerServerAutoApply, pollAutoApplyStatus, diagnoseFailure, domStep, pushExtensionLogs } from '../lib/api-client.js'
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

async function runApplyAgent(tabId, applyUrl, resumeData, maxSteps = 20) {
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

async function applyViaClientSide(app, resumeData) {
  // Use the original applyUrl — let the agent detect Easy Apply vs external-redirect
  // and click the appropriate anchor. agent.js's anchor click uses window.location.href
  // which navigates properly for both LinkedIn SPA (opens /apply/ modal) and external ATS.
  const applyUrl = app.job?.applyUrl
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

    const result = await runApplyAgent(tab.id, applyUrl, resumeData, 20)
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

async function startAutoApply() {
  // Prevent duplicate starts
  const { isRunning } = await chrome.storage.local.get('isRunning')
  if (isRunning) return

  sessionStartTime = Date.now()
  await setState({ logs: [] })
  const batchId = await generateBatchId()
  await addLog(`Batch started: ${batchId}`)
  await addLog('Fetching applications & resume...')

  let applications, resumeData
  try {
    [applications, resumeData] = await Promise.all([
      fetchSavedApplications(),
      fetchResumeData(),
    ])
  } catch (err) {
    await addLog(`Error: ${err.message}`)
    return
  }

  if (applications.length === 0) {
    await addLog('No saved jobs to apply')
    return
  }

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

  const { dailyLimit = 20 } = await chrome.storage.local.get('dailyLimit')
  const queue = applications.slice(0, dailyLimit)

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

  try {
    const isLinkedIn = applyUrl.includes('linkedin.com')
    if (isLinkedIn) {
      // LinkedIn blocks server IP — always client-side
      await addLog('  → Client-side apply (LinkedIn)...')
      result = await applyViaClientSide(app, resumeData)
    } else {
      // Non-LinkedIn — try server first, fallback to client-side
      await addLog('  → Sending to server auto-apply...')
      const triggerRes = await triggerServerAutoApply(app.id)
      if (!triggerRes.success) {
        await addLog(`  ⚠️ Server rejected: ${triggerRes.error?.code || 'unknown'} — falling back to client-side...`)
        result = await applyViaClientSide(app, resumeData)
      } else {
        await addLog('  → Server processing... polling status')
        result = await pollAutoApplyStatus(app.id, 120000)
        if (result.status === 'failed' && !isPermanentError(result.reason)) {
          await addLog(`  ⚠️ Server failed: ${result.reason} — trying client-side...`)
          result = await applyViaClientSide(app, resumeData)
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
  scheduleNext()
}


function scheduleNext() {
  const delay = randomDelay()
  const seconds = Math.round(delay / 1000)
  chrome.alarms.create('nextJob', { delayInMinutes: delay / 60000 })
  addLog(`  ⏳ Next in ${seconds}s`)
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
