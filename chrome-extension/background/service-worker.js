import { fetchSavedApplications, updateStatus } from '../lib/api-client.js'

const JOB_DELAY_MIN = 30000
const JOB_DELAY_MAX = 90000

function randomDelay(min = JOB_DELAY_MIN, max = JOB_DELAY_MAX) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function getState() {
  return chrome.storage.local.get(['isRunning', 'queue', 'currentIndex', 'results', 'logs', 'dailyLimit'])
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
  await addLog('Fetching saved applications...')

  let applications
  try {
    applications = await fetchSavedApplications()
  } catch (err) {
    await addLog(`Error: ${err.message}`)
    return
  }

  if (applications.length === 0) {
    await addLog('No saved LinkedIn jobs to apply')
    return
  }

  const { dailyLimit = 20 } = await chrome.storage.local.get('dailyLimit')
  const queue = applications.slice(0, dailyLimit)

  await setState({
    isRunning: true,
    queue,
    currentIndex: 0,
    results: { applied: 0, skipped: 0, failed: 0 },
  })

  await addLog(`Found ${queue.length} jobs. Starting auto-apply...`)
  processNextJob()
}

async function stopAutoApply() {
  await setState({ isRunning: false })
  await addLog('Stopped by user')
}

async function processNextJob() {
  const state = await getState()
  if (!state.isRunning) return

  const { queue = [], currentIndex = 0, results = { applied: 0, skipped: 0, failed: 0 } } = state
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

  if (!applyUrl || !applyUrl.includes('linkedin.com')) {
    await addLog('  ❌ Skipped — not LinkedIn')
    results.skipped++
    await setState({ currentIndex: currentIndex + 1, results })
    scheduleNext()
    return
  }

  // Open LinkedIn job page in new tab
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

  // Wait for page load
  await new Promise(resolve => {
    function onUpdate(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdate)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdate)
    // Timeout after 20 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdate)
      resolve()
    }, 20000)
  })

  // Wait extra for LinkedIn JS to load
  await new Promise(r => setTimeout(r, 3000))

  // Send message to content script
  let result
  try {
    result = await chrome.tabs.sendMessage(tab.id, { action: 'APPLY_TO_JOB' })
  } catch (err) {
    await addLog(`  ❌ Content script error: ${err.message}`)
    results.failed++
    try { chrome.tabs.remove(tab.id) } catch {}
    await setState({ currentIndex: currentIndex + 1, results })
    scheduleNext()
    return
  }

  // Close tab
  try { chrome.tabs.remove(tab.id) } catch {}

  // Process result
  if (result.status === 'applied') {
    await updateStatus(app.id, 'applied')
    results.applied++
    await addLog(`  ✅ Applied${result.reason === 'already_applied' ? ' (was already applied)' : ''}`)
  } else if (result.status === 'skipped' || result.status === 'needs_review') {
    results.skipped++
    await addLog(`  ⏭ Skipped: ${result.reason}`)
  } else {
    results.failed++
    await addLog(`  ❌ Failed: ${result.reason}`)
  }

  await setState({ currentIndex: currentIndex + 1, results })
  scheduleNext()
}

function scheduleNext() {
  const delay = randomDelay()
  const seconds = Math.round(delay / 1000)
  chrome.alarms.create('nextJob', { delayInMinutes: delay / 60000 })
  addLog(`  ⏳ Next in ${seconds}s`)
}

// Alarm handler
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'nextJob') processNextJob()
})

// Message handler from popup
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
