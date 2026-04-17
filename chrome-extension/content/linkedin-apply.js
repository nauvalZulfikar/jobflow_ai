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

async function walkFormSteps(modal) {
  for (let step = 0; step < 10; step++) {
    await humanDelay(1000, 2000)

    // Check for file upload requirement
    const fileInput = modal.querySelector('input[type="file"]')
    if (fileInput && fileInput.offsetParent !== null) {
      // Check if a resume is already attached (LinkedIn sometimes pre-attaches)
      const hasAttachment = modal.querySelector('.jobs-document-upload__container, .jobs-resume-picker__resume-list')
      if (!hasAttachment) {
        return { status: 'needs_review', reason: 'resume_upload_required' }
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

async function handleApply() {
  try {
    // Wait for page to fully load
    await humanDelay(2000, 3000)

    // Step 1: Find Easy Apply
    const easyApplyBtn = findEasyApplyButton()
    if (!easyApplyBtn) {
      return { status: 'skipped', reason: 'no_easy_apply' }
    }

    // Step 2: Click Easy Apply
    easyApplyBtn.click()
    await humanDelay(2000, 3000)

    // Step 3: Wait for modal
    const modal = await waitForElement('[role="dialog"], .jobs-easy-apply-modal', 5000)
    if (!modal) {
      return { status: 'failed', reason: 'modal_not_opened' }
    }

    // Step 4: Walk through form
    return await walkFormSteps(modal)
  } catch (err) {
    return { status: 'failed', reason: err.message }
  }
}

function getExternalApplyUrl() {
  // Find the external "Apply" button (not Easy Apply)
  const links = document.querySelectorAll('a')
  for (const link of links) {
    const text = link.textContent.trim().toLowerCase()
    if ((text === 'apply' || text.includes('apply now')) && !text.includes('easy') && link.href) {
      return { url: link.href }
    }
  }
  // Check for "Apply" buttons that open external links
  const buttons = document.querySelectorAll('button')
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase()
    if ((text === 'apply' || text.includes('apply now')) && !text.includes('easy')) {
      // Click it and see if it opens a new tab/navigates
      return { url: null, click: true }
    }
  }
  return { url: null }
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'APPLY_TO_JOB') {
    handleApply().then(sendResponse)
    return true
  }
  if (message.action === 'GET_EXTERNAL_APPLY_URL') {
    sendResponse(getExternalApplyUrl())
  }
  if (message.action === 'PING') {
    sendResponse({ ok: true })
  }
})
