import { fetchSavedApplications, fetchResumeData, updateStatus, checkLinkedInSession, detectFormViaVision } from '../lib/api-client.js'

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

function waitForTabLoad(tabId, timeout = 25000) {
  return new Promise(resolve => {
    function onUpdate(tid, info) {
      if (tid === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdate)
        resolve(true)
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdate)
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpdate); resolve(false) }, timeout)
  })
}

function waitForNewTab(timeout = 8000) {
  return new Promise(resolve => {
    let resolved = false
    function onCreated(newTab) {
      if (!resolved) {
        resolved = true
        chrome.tabs.onCreated.removeListener(onCreated)
        resolve(newTab)
      }
    }
    chrome.tabs.onCreated.addListener(onCreated)
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        chrome.tabs.onCreated.removeListener(onCreated)
        resolve(null)
      }
    }, timeout)
  })
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

  const isLinkedIn = applyUrl.includes('linkedin.com')
  let tab, result

  try {
    if (isLinkedIn) {
      // STEP 1: Open directly to /apply/ URL (skip job view page)
      const applyPageUrl = applyUrl.replace(/\/+$/, '') + '/apply/?openSDUIApplyFlow=true'
      tab = await chrome.tabs.create({ url: applyPageUrl, active: false })
      await waitForTabLoad(tab.id)
      await new Promise(r => setTimeout(r, 4000))

      // Inject content script and try Easy Apply
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/linkedin-apply.js'],
      })
      await new Promise(r => setTimeout(r, 1000))

      try {
        result = await chrome.tabs.sendMessage(tab.id, { action: 'APPLY_TO_JOB', resumeData: resumeData || {} })
      } catch {
        result = null
      }

      // If Easy Apply failed or no modal, try the job view page for external apply
      if (!result || result.status === 'failed' || result.status === 'skipped') {
        await addLog('  → No Easy Apply, trying external apply...')
        await chrome.tabs.update(tab.id, { url: applyUrl })
        await waitForTabLoad(tab.id)
        await new Promise(r => setTimeout(r, 4000))

        // Find external apply URL from job page
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/linkedin-apply.js'],
        })
        await new Promise(r => setTimeout(r, 1000))

        let externalUrl
        try {
          externalUrl = await chrome.tabs.sendMessage(tab.id, { action: 'GET_EXTERNAL_APPLY_URL' })
        } catch {}

        if (externalUrl?.url) {
          await chrome.tabs.update(tab.id, { url: externalUrl.url })
          await waitForTabLoad(tab.id)
          await new Promise(r => setTimeout(r, 4000))
          result = await applyViaATS(tab.id, resumeData)
        } else if (externalUrl?.click) {
          // Button-based apply — click and capture navigation/new tab
          await addLog('  → Clicking apply button...')
          const newTabPromise = waitForNewTab(8000)
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'CLICK_APPLY_BUTTON' })
          } catch {}
          await new Promise(r => setTimeout(r, 3000))

          // Check if current tab navigated to external site
          let captured = false
          try {
            const currentTab = await chrome.tabs.get(tab.id)
            if (currentTab.url && !currentTab.url.includes('linkedin.com')) {
              await waitForTabLoad(tab.id)
              await new Promise(r => setTimeout(r, 4000))
              result = await applyViaATS(tab.id, resumeData)
              captured = true
            }
          } catch {}

          if (!captured) {
            // Check if a new tab was opened
            const newTab = await newTabPromise
            if (newTab && newTab.id) {
              try { chrome.tabs.remove(tab.id) } catch {}
              tab = newTab
              await waitForTabLoad(tab.id)
              await new Promise(r => setTimeout(r, 4000))
              result = await applyViaATS(tab.id, resumeData)
            } else {
              result = { status: 'failed', reason: 'no_apply_option_found' }
            }
          }
        } else {
          result = { status: 'failed', reason: 'no_apply_option_found' }
        }
      }
    } else {
      // External ATS page directly
      tab = await chrome.tabs.create({ url: applyUrl, active: false })
      await waitForTabLoad(tab.id)
      await new Promise(r => setTimeout(r, 4000))
      result = await applyViaATS(tab.id, resumeData)
    }
  } catch (err) {
    result = { status: 'failed', reason: err.message || 'unknown_error' }
  }

  // Close tab
  try { if (tab) chrome.tabs.remove(tab.id) } catch {}

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

async function captureScreenshot(tabId) {
  try {
    // Capture visible tab as base64 PNG
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
    return dataUrl.replace(/^data:image\/png;base64,/, '')
  } catch {
    return null
  }
}

async function applyViaATS(tabId, resumeData) {
  try {
    // Inject the ATS content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/ats-apply.js'],
    })
    await new Promise(r => setTimeout(r, 1000))

    // Send resume data and trigger form fill + submit
    const result = await chrome.tabs.sendMessage(tabId, {
      action: 'ATS_APPLY',
      resumeData: resumeData || {},
    })

    // Fix 5: Vision fallback — if ATS handler couldn't find submit button
    if (result && result.status === 'needs_review' && result.reason?.includes('no submit button')) {
      await addLog('  🔍 Vision fallback: analyzing page screenshot...')
      const screenshot = await captureScreenshot(tabId)
      if (screenshot) {
        const tab = await chrome.tabs.get(tabId)
        const visionResult = await detectFormViaVision(screenshot, tab.url)
        if (visionResult?.submitSelector) {
          await addLog(`  🎯 Vision found submit: ${visionResult.submitSelector}`)
          // Try clicking the AI-detected submit button
          try {
            const clickResult = await chrome.scripting.executeScript({
              target: { tabId },
              func: (selector) => {
                const btn = document.querySelector(selector)
                if (btn) { btn.click(); return true }
                return false
              },
              args: [visionResult.submitSelector],
            })
            if (clickResult?.[0]?.result) {
              await new Promise(r => setTimeout(r, 4000))
              return { status: 'applied', reason: 'vision_fallback_submit' }
            }
          } catch {}
        }
      }
    }

    return result || { status: 'failed', reason: 'no_response' }
  } catch (err) {
    return { status: 'failed', reason: `ats_inject_failed: ${err.message}` }
  }
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
