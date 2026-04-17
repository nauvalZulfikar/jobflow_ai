// Content script — runs on linkedin.com/jobs/* pages
// Waits for message from background service worker to start applying

function humanDelay(min = 1000, max = 3000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise(resolve => setTimeout(resolve, ms))
}

function waitForElement(selector, timeout = 5000) {
  return new Promise(resolve => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) { observer.disconnect(); resolve(el) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
  })
}

function findButton(container, textOptions) {
  const buttons = container.querySelectorAll('button')
  for (const btn of buttons) {
    const text = btn.textContent.trim()
    for (const option of textOptions) {
      if (text.includes(option) && !btn.disabled && btn.offsetParent !== null) {
        return btn
      }
    }
  }
  return null
}

function findEasyApplyButton() {
  // Check <a> tags first (LinkedIn sometimes uses links)
  const links = document.querySelectorAll('a')
  for (const link of links) {
    if (link.textContent.includes('Easy Apply') && link.offsetParent !== null) {
      return link
    }
  }
  // Check buttons
  const buttons = document.querySelectorAll('button')
  for (const btn of buttons) {
    if (btn.textContent.includes('Easy Apply') && btn.offsetParent !== null) {
      return btn
    }
  }
  return null
}

async function uploadResume(fileInput, resumeUrl) {
  if (!resumeUrl || !fileInput) return false
  try {
    const response = await fetch(resumeUrl)
    if (!response.ok) return false
    const blob = await response.blob()
    const ext = (resumeUrl.match(/\.(pdf|docx?|rtf)(\?|$)/i)?.[1] || 'pdf').toLowerCase()
    const mime = ext === 'pdf' ? 'application/pdf'
      : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === 'doc' ? 'application/msword'
      : 'application/octet-stream'
    const file = new File([blob], `resume.${ext}`, { type: mime })
    const dt = new DataTransfer()
    dt.items.add(file)
    fileInput.files = dt.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

function hasRequiredEmptyFields(modal) {
  const inputs = modal.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea')
  for (const input of inputs) {
    const required = input.hasAttribute('required') || input.getAttribute('aria-required') === 'true'
    if (!required) continue
    if (input.tagName === 'SELECT') {
      if (input.selectedIndex <= 0) return true
    } else if (!input.value || input.value.trim() === '') {
      return true
    }
  }
  return false
}

async function walkFormSteps(modal, resumeData = {}) {
  for (let step = 0; step < 10; step++) {
    await humanDelay(1000, 2000)

    // Check for file upload requirement
    const fileInput = modal.querySelector('input[type="file"]')
    if (fileInput && fileInput.offsetParent !== null) {
      // Check if a resume is already attached (LinkedIn sometimes pre-attaches)
      const hasAttachment = modal.querySelector('.jobs-document-upload__container, .jobs-resume-picker__resume-list')
      if (!hasAttachment) {
        const uploaded = await uploadResume(fileInput, resumeData.resumeUrl)
        if (!uploaded) {
          return { status: 'needs_review', reason: 'resume_upload_required' }
        }
        await humanDelay(2000, 4000)
      }
    }

    // Look for Submit button
    const submitBtn = findButton(modal, ['Submit application', 'Submit'])
    if (submitBtn) {
      submitBtn.click()
      await humanDelay(3000, 5000)
      return await verifySubmission()
    }

    // Look for Next/Review/Continue
    const nextBtn = findButton(modal, ['Next', 'Review', 'Continue'])
    if (nextBtn) {
      nextBtn.click()
      await humanDelay(1500, 2500)
      continue
    }

    // Neither — stuck
    return { status: 'failed', reason: 'no_navigation_button' }
  }
  return { status: 'failed', reason: 'too_many_steps' }
}

async function verifySubmission() {
  await humanDelay(2000, 3000)
  const body = document.body.innerText.toLowerCase()
  if (
    body.includes('application was sent') ||
    body.includes('application submitted') ||
    body.includes('application has been submitted')
  ) {
    return { status: 'applied' }
  }

  // Check if modal closed (submission succeeded but different confirmation)
  const modal = document.querySelector('[role="dialog"]')
  if (!modal || modal.offsetParent === null) {
    return { status: 'applied' }
  }

  // Check for "already applied"
  if (body.includes('already applied') || body.includes('you applied')) {
    return { status: 'applied', reason: 'already_applied' }
  }

  return { status: 'failed', reason: 'no_confirmation' }
}

async function handleApply(resumeData = {}) {
  try {
    await humanDelay(1000, 2000)

    // We're on /apply/ page — modal should already be open
    let modal = await waitForElement('[role="dialog"], .jobs-easy-apply-modal', 20000)
    if (!modal) {
      // Retry once — LinkedIn SPA sometimes needs a nudge to render the modal
      window.scrollBy(0, 300)
      await humanDelay(1500, 2500)
      modal = await waitForElement('[role="dialog"], .jobs-easy-apply-modal', 10000)
    }
    if (modal) {
      return await walkFormSteps(modal, resumeData)
    }

    // No modal — check if this job even has Easy Apply
    const body = document.body.innerText.toLowerCase()
    if (body.includes('already applied') || body.includes('you applied')) {
      return { status: 'applied', reason: 'already_applied' }
    }

    // Check if page shows "Application submitted" (redirected after auto-submit)
    if (body.includes('application submitted') || body.includes('application was sent')) {
      return { status: 'applied', reason: 'already_submitted' }
    }

    return { status: 'failed', reason: 'no_easy_apply_modal' }
  } catch (err) {
    return { status: 'failed', reason: err.message || 'unknown' }
  }
}

function getExternalApplyUrl() {
  // Strategy 1: LinkedIn-specific selectors for external apply links
  const linkedinSelectors = [
    'a[href*="/jobs/view/externalApply/"]',
    'a[href*="externalApply"]',
    '.jobs-apply-button--top-card a[href]',
    '.jobs-s-apply a[href]',
    '.job-details-jobs-unified-top-card__container--two-pane a[href]',
    'a[data-tracking-control-name*="apply"]',
    'a[data-tracking-control-name="bedrock_apply_external"]',
  ]

  for (const selector of linkedinSelectors) {
    const els = document.querySelectorAll(selector)
    for (const el of els) {
      if (el.href && !el.textContent.toLowerCase().includes('easy') && el.offsetParent !== null) {
        return { url: el.href }
      }
    }
  }

  // Strategy 2: Any visible link with apply-like text
  const links = document.querySelectorAll('a[href]')
  for (const link of links) {
    const text = link.textContent.trim().toLowerCase()
    if (link.offsetParent !== null && link.href && !text.includes('easy')) {
      if (text === 'apply' || text.includes('apply now') || text.includes('apply on') ||
          text.includes('apply to') || text.includes('apply for')) {
        return { url: link.href }
      }
    }
  }

  // Strategy 3: Buttons/role elements that trigger navigation (need click to capture URL)
  const buttons = [...document.querySelectorAll('button, [role="button"], [role="link"]')]
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase()
    if (!text.includes('easy') && btn.offsetParent !== null && !btn.disabled) {
      if (text === 'apply' || text.includes('apply now') || text.includes('apply on') ||
          text.includes('apply to') || text.includes('apply for')) {
        return { url: null, click: true }
      }
    }
  }

  return { url: null }
}

async function clickApplyButton() {
  const elements = [...document.querySelectorAll('a, button, [role="button"], [role="link"]')]
  for (const el of elements) {
    const text = el.textContent.trim().toLowerCase()
    if (!text.includes('easy') && el.offsetParent !== null && !el.disabled) {
      if (text === 'apply' || text.includes('apply now') || text.includes('apply on') ||
          text.includes('apply to') || text.includes('apply for')) {
        el.click()
        return { clicked: true }
      }
    }
  }
  return { clicked: false }
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'APPLY_TO_JOB') {
    handleApply(message.resumeData || {}).then(sendResponse)
    return true
  }
  if (message.action === 'GET_EXTERNAL_APPLY_URL') {
    sendResponse(getExternalApplyUrl())
  }
  if (message.action === 'CLICK_APPLY_BUTTON') {
    clickApplyButton().then(sendResponse)
    return true
  }
  if (message.action === 'PING') {
    sendResponse({ ok: true })
  }
})
