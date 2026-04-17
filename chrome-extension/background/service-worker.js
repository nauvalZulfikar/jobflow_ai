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
  // Clear logs from previous run
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
        result = await chrome.tabs.sendMessage(tab.id, { action: 'APPLY_TO_JOB' })
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

  if (result.status === 'applied') {
    await updateStatus(app.id, 'applied')
    results.applied++
    await addLog(`  ✅ Applied${result.reason ? ` (${result.reason})` : ''}`)
  } else if (result.status === 'needs_review') {
    results.skipped++
    await addLog(`  ⏭ Needs review: ${result.reason || 'unknown'}`)
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
