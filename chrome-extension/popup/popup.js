const $ = id => document.getElementById(id)

// Token save
$('save-token-btn').addEventListener('click', async () => {
  const token = $('token-input').value.trim()
  if (!token) return
  await chrome.storage.local.set({ apiToken: token })
  $('token-input').value = ''
  $('token-input').placeholder = 'Token saved ✓'
  setTimeout(() => { $('token-input').placeholder = 'Paste token dari Settings Jobflow...' }, 2000)
})

// Load saved token indicator
chrome.storage.local.get('apiToken', ({ apiToken }) => {
  if (apiToken) $('token-input').placeholder = 'Token saved ✓ (paste baru untuk ganti)'
})

// Dev mode toggle (runtime — no need to edit config.js)
chrome.storage.local.get('devMode', ({ devMode }) => {
  $('dev-mode-toggle').checked = !!devMode
})
$('dev-mode-toggle').addEventListener('change', async e => {
  await chrome.storage.local.set({ devMode: e.target.checked })
})

// Daily schedule
chrome.storage.local.get(['scheduleEnabled', 'scheduleHour'], ({ scheduleEnabled, scheduleHour }) => {
  $('schedule-enabled').checked = !!scheduleEnabled
  $('schedule-hour').value = scheduleHour ?? 9
  refreshScheduleStatus()
})

async function refreshScheduleStatus() {
  const alarm = await chrome.alarms.get('dailyAutoApply')
  if (!alarm) {
    $('schedule-status').textContent = 'No alarm scheduled'
    return
  }
  const next = new Date(alarm.scheduledTime)
  $('schedule-status').textContent = `Next run: ${next.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`
}

async function applySchedule() {
  const enabled = $('schedule-enabled').checked
  const hour = Math.max(0, Math.min(23, Number($('schedule-hour').value) || 9))
  await chrome.storage.local.set({ scheduleEnabled: enabled, scheduleHour: hour })
  await chrome.runtime.sendMessage({ action: 'RESCHEDULE_DAILY' })
  setTimeout(refreshScheduleStatus, 200)
}

$('schedule-enabled').addEventListener('change', applySchedule)
$('schedule-hour').addEventListener('change', applySchedule)

// Start
$('start-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'START' })
})

// Stop
$('stop-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'STOP' })
})

// Poll state
function updateUI() {
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, state => {
    if (chrome.runtime.lastError || !state) return

    const { isRunning, queue = [], currentIndex = 0, results = {}, logs = [], retryQueue = [], lastUpdated } = state
    if (lastUpdated) $('last-updated').textContent = `updated ${lastUpdated}`
    const total = queue.length
    const progress = total > 0 ? Math.round((currentIndex / total) * 100) : 0

    // Status badge
    const badge = $('status-badge')
    badge.textContent = isRunning ? 'Running' : 'Idle'
    badge.className = `status-badge ${isRunning ? 'status-running' : 'status-idle'}`

    // Buttons
    $('start-btn').style.display = isRunning ? 'none' : ''
    $('stop-btn').style.display = isRunning ? '' : 'none'

    // Progress
    $('progress-bar').style.width = `${progress}%`
    const retryInfo = retryQueue.length > 0 ? ` (${retryQueue.length} in retry)` : ''
    $('progress-text').textContent = total > 0 ? `${currentIndex} / ${total} jobs${retryInfo}` : '—'

    // Stats
    $('stat-applied').textContent = results.applied || 0
    $('stat-skipped').textContent = results.skipped || 0
    $('stat-failed').textContent = results.failed || 0

    // Logs — only auto-scroll if user is already at bottom
    const logsEl = $('logs')
    const wasAtBottom = logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 10
    logsEl.textContent = logs.join('\n')
    if (wasAtBottom) logsEl.scrollTop = logsEl.scrollHeight
  })
}

updateUI()
setInterval(updateUI, 1000)
