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

    const { isRunning, queue = [], currentIndex = 0, results = {}, logs = [] } = state
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
    $('progress-text').textContent = total > 0 ? `${currentIndex} / ${total} jobs` : '—'

    // Stats
    $('stat-applied').textContent = results.applied || 0
    $('stat-skipped').textContent = results.skipped || 0
    $('stat-failed').textContent = results.failed || 0

    // Logs
    const logsEl = $('logs')
    logsEl.textContent = logs.join('\n')
    logsEl.scrollTop = logsEl.scrollHeight
  })
}

updateUI()
setInterval(updateUI, 1000)
