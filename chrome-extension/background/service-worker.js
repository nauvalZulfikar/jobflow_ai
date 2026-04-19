import { fetchSavedApplications, fetchResumeData, updateStatus, checkLinkedInSession, triggerServerAutoApply, pollAutoApplyStatus } from '../lib/api-client.js'

// ---------------------------------------------------------------------------
// Client-side apply — opens a tab in user's browser, uses content scripts
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

function sendTabMessage(tabId, message, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('content_script_timeout')), timeoutMs)
    chrome.tabs.sendMessage(tabId, message, response => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(response)
      }
    })
  })
}

async function applyViaClientSide(app, resumeData) {
  const applyUrl = app.job?.applyUrl
  const isLinkedIn = applyUrl?.includes('linkedin.com')
  let tab = null

  try {
    tab = await chrome.tabs.create({ url: applyUrl, active: false })
    await waitForTabLoad(tab.id)
    // Let page JS settle
    await new Promise(r => setTimeout(r, 3000))

    let result
    if (isLinkedIn) {
      // Content script auto-injected via manifest for linkedin.com/jobs/*
      result = await sendTabMessage(tab.id, {
        action: 'APPLY_TO_JOB',
        resumeData,
      })
    } else {
      // Inject ATS content script dynamically
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/ats-apply.js'],
      })
      await new Promise(r => setTimeout(r, 1500))
      result = await sendTabMessage(tab.id, {
        action: 'ATS_APPLY',
        resumeData,
      })
    }

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

async function addLog(msg) {
  const { logs = [] } = await chrome.storage.local.get('logs')
  const time = new Date().toLocaleTimeString('id-ID')
  const runtime = sessionStartTime ? ` +${formatRuntime(Date.now() - sessionStartTime)}` : ''
  logs.push(`[${time}${runtime}] ${msg}`)
  if (logs.length > 50) logs.splice(0, logs.length - 50)
  await setState({ logs })
}

async function startAutoApply() {
  // Prevent duplicate starts
  const { isRunning } = await chrome.storage.local.get('isRunning')
  if (isRunning) return

  // Clear logs from previous run
  sessionStartTime = Date.now()
  await setState({ logs: [] })
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
    await addLog(`Done! Applied: ${results.applied}, Skipped: ${results.skipped}, Failed: ${results.failed}`)
    return
  }

  const app = queue[currentIndex]
  const jobTitle = app.job?.title || 'Unknown'
  const company = app.job?.company || ''
  const applyUrl = app.job?.applyUrl

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
  const isLinkedIn = applyUrl.includes('linkedin.com')

  try {
    if (isLinkedIn) {
      // LinkedIn → client-side (server IP is blocked by LinkedIn)
      await addLog('  → Client-side LinkedIn apply...')
      result = await applyViaClientSide(app, resumeData)
    } else {
      // Non-LinkedIn → try server first, fallback to client-side ATS
      await addLog('  → Sending to server auto-apply...')
      const triggerRes = await triggerServerAutoApply(app.id)

      if (!triggerRes.success) {
        const errMsg = triggerRes.error?.code || 'unknown'
        const errDetail = triggerRes.error?.message || ''
        await addLog(`  ⚠️ Server rejected: ${errMsg} — ${errDetail}`)
        await addLog('  → Falling back to client-side ATS...')
        result = await applyViaClientSide(app, resumeData)
      } else {
        await addLog('  → Server processing... polling status')
        result = await pollAutoApplyStatus(app.id, 120000)
        // If server-side failed (e.g. Playwright error), try client-side
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
    await addLog(`  ✅ Applied${result.reason ? ` (${result.reason})` : ''}`)
  } else if (result.status === 'needs_review') {
    // Needs review = user intervention required, don't retry
    await updateStatus(app.id, 'saved', `[auto-apply skip] ${result.reason || 'unknown'}`)
    results.skipped++
    await addLog(`  ⏭ Needs review: ${result.reason || 'unknown'}`)
  } else {
    // Failed — classify error before deciding retry
    const reason = result.reason || 'unknown'
    const retryCount = app._retryCount || 0

    if (isPermanentError(reason)) {
      // Permanent error — skip retry, mark as failed immediately
      await updateStatus(app.id, 'saved', `[auto-apply error] ${reason} (permanent)`)
      results.failed++
      await addLog(`  ❌ Permanent failure: ${reason} — no retry`)
    } else if (retryCount < MAX_RETRIES) {
      // Transient error — add to retry queue
      retryQueue.push({ ...app, _retryCount: retryCount + 1, _retryReason: reason })
      await addLog(`  ⚠️ Failed: ${reason} — will retry (${retryCount + 1}/${MAX_RETRIES})`)
    } else {
      await updateStatus(app.id, 'saved', `[auto-apply error] ${reason} (after ${MAX_RETRIES} retries)`)
      results.failed++
      await addLog(`  ❌ Failed after ${MAX_RETRIES} retries: ${reason}`)
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
    getState().then(sendResponse)
    return true
  }
})
