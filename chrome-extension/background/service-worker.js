import { fetchSavedApplications, fetchResumeData, updateStatus } from '../lib/api-client.js'

const JOB_DELAY_MIN = 30000
const JOB_DELAY_MAX = 90000

function randomDelay(min = JOB_DELAY_MIN, max = JOB_DELAY_MAX) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function getState() {
  return chrome.storage.local.get(['isRunning', 'queue', 'currentIndex', 'results', 'logs', 'dailyLimit', 'resumeData'])
}

async function setState(updates) {
  await chrome.storage.local.set(updates)
}

async function addLog(msg) {
  const { logs = [] } = await chrome.storage.local.get('logs')
  logs.push(`[${new Date().toLocaleTimeString('id-ID')}] ${msg}`)
  if (logs.length > 50) logs.splice(0, logs.length - 50)
  await setState({ logs })
}

async function startAutoApply() {
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

  const { dailyLimit = 20 } = await chrome.storage.local.get('dailyLimit')
  const queue = applications.slice(0, dailyLimit)

  await setState({
    isRunning: true,
    queue,
    currentIndex: 0,
    results: { applied: 0, skipped: 0, failed: 0 },
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

async function processNextJob() {
  const state = await getState()
  if (!state.isRunning) return

  const { queue = [], currentIndex = 0, results = { applied: 0, skipped: 0, failed: 0 }, resumeData } = state
  if (currentIndex >= queue.length) {
    await setState({ isRunning: false })
    await addLog(`Done! Applied: ${results.applied}, Skipped: ${results.skipped}, Failed: ${results.failed}`)
    return
  }

  const app = queue[currentIndex]
  const jobTitle = app.job?.title || 'Unknown'
  const company = app.job?.company || ''
  const applyUrl = app.job?.applyUrl

  await addLog(`[${currentIndex + 1}/${queue.length}] ${jobTitle} @ ${company}`)

  if (!applyUrl) {
    await addLog('  ❌ No apply URL')
    results.failed++
    await setState({ currentIndex: currentIndex + 1, results })
    scheduleNext()
    return
  }

  const isLinkedIn = applyUrl.includes('linkedin.com')

  // Open job page
  let tab
  try {
    tab = await chrome.tabs.create({ url: applyUrl, active: false })
  } catch (err) {
    await addLog(`  ❌ Failed to open tab: ${err.message}`)
    results.failed++
    await setState({ currentIndex: currentIndex + 1, results })
    scheduleNext()
    return
  }

  await waitForTabLoad(tab.id)
  await new Promise(r => setTimeout(r, 3000))

  let result

  if (isLinkedIn) {
    // LinkedIn Easy Apply flow — use linkedin-apply.js content script (auto-injected)
    try {
      result = await chrome.tabs.sendMessage(tab.id, { action: 'APPLY_TO_JOB' })
    } catch (err) {
      // If Easy Apply fails/not available, try external apply
      result = { status: 'skipped', reason: 'no_easy_apply' }
    }

    // If no Easy Apply, find and click external Apply button → navigate to ATS
    if (result.status === 'skipped' && result.reason === 'no_easy_apply') {
      await addLog('  → No Easy Apply, trying external apply...')

      // Click the external Apply button on LinkedIn
      try {
        const externalUrl = await chrome.tabs.sendMessage(tab.id, { action: 'GET_EXTERNAL_APPLY_URL' })
        if (externalUrl?.url) {
          await chrome.tabs.update(tab.id, { url: externalUrl.url })
          await waitForTabLoad(tab.id)
          await new Promise(r => setTimeout(r, 3000))
          // Inject ATS content script and fill form
          result = await applyViaATS(tab.id, resumeData)
        }
      } catch {
        result = { status: 'failed', reason: 'external_apply_failed' }
      }
    }
  } else {
    // Direct ATS page — inject and fill
    result = await applyViaATS(tab.id, resumeData)
  }

  // Close tab
  try { chrome.tabs.remove(tab.id) } catch {}

  // Process result
  if (result.status === 'applied') {
    await updateStatus(app.id, 'applied')
    results.applied++
    await addLog(`  ✅ Applied${result.reason ? ` (${result.reason})` : ''}`)
  } else if (result.status === 'needs_review') {
    results.skipped++
    await addLog(`  ⏭ Needs review: ${result.reason}`)
  } else {
    results.failed++
    await addLog(`  ❌ Failed: ${result.reason}`)
  }

  await setState({ currentIndex: currentIndex + 1, results })
  scheduleNext()
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
