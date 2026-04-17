// Generic ATS form filler — handles Greenhouse, Lever, Workday, and any career page
// Injected dynamically by background service worker on external apply pages

function humanDelay(min = 500, max = 1500) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min))
}

function waitForElement(selector, timeout = 8000) {
  return new Promise(resolve => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) { obs.disconnect(); resolve(el) }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { obs.disconnect(); resolve(null) }, timeout)
  })
}

// Field label → resume data key mapping
const FIELD_MAP = {
  // Name
  'first name': 'firstName', 'nama depan': 'firstName', 'given name': 'firstName',
  'last name': 'lastName', 'nama belakang': 'lastName', 'surname': 'lastName', 'family name': 'lastName',
  'full name': 'fullName', 'nama lengkap': 'fullName', 'name': 'fullName',
  // Contact
  'email': 'email', 'e-mail': 'email', 'email address': 'email',
  'phone': 'phone', 'telephone': 'phone', 'mobile': 'phone', 'nomor telepon': 'phone',
  'phone number': 'phone', 'mobile number': 'phone', 'no hp': 'phone', 'no telepon': 'phone',
  // Location
  'city': 'city', 'kota': 'city', 'location': 'location', 'lokasi': 'location',
  'address': 'address', 'alamat': 'address',
  'country': 'country', 'negara': 'country',
  // Professional
  'linkedin': 'linkedin', 'linkedin url': 'linkedin', 'linkedin profile': 'linkedin',
  'github': 'github', 'github url': 'github',
  'portfolio': 'portfolio', 'website': 'portfolio', 'personal website': 'portfolio',
  'current company': 'currentCompany', 'perusahaan saat ini': 'currentCompany',
  'current title': 'currentTitle', 'jabatan saat ini': 'currentTitle',
  'years of experience': 'yearsExp', 'pengalaman': 'yearsExp', 'experience': 'yearsExp',
  'salary': 'salary', 'expected salary': 'salary', 'gaji': 'salary',
  'cover letter': 'coverLetter', 'surat lamaran': 'coverLetter',
  'summary': 'summary', 'about': 'summary', 'tentang': 'summary',
}

function getFieldLabel(input) {
  // Try multiple strategies to find the label
  const id = input.id || input.getAttribute('name') || ''

  // 1. Explicit <label for="">
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`)
    if (label) return label.textContent.trim().toLowerCase()
  }

  // 2. Parent label
  const parentLabel = input.closest('label')
  if (parentLabel) return parentLabel.textContent.trim().toLowerCase()

  // 3. Previous sibling or nearby label
  const parent = input.closest('.field, .form-group, .form-field, [class*="field"], [class*="input"]')
  if (parent) {
    const label = parent.querySelector('label, .label, [class*="label"]')
    if (label) return label.textContent.trim().toLowerCase()
  }

  // 4. Placeholder
  if (input.placeholder) return input.placeholder.toLowerCase()

  // 5. aria-label
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label').toLowerCase()

  // 6. Name/id as fallback
  return (input.getAttribute('name') || id).replace(/[-_]/g, ' ').toLowerCase()
}

function matchField(label) {
  // Exact match
  if (FIELD_MAP[label]) return FIELD_MAP[label]
  // Partial match
  for (const [key, value] of Object.entries(FIELD_MAP)) {
    if (label.includes(key) || key.includes(label)) return value
  }
  return null
}

function detectATS() {
  const url = window.location.href.toLowerCase()
  const html = document.body?.innerHTML?.substring(0, 5000)?.toLowerCase() || ''

  if (url.includes('greenhouse.io') || html.includes('greenhouse')) return 'greenhouse'
  if (url.includes('lever.co') || html.includes('lever-')) return 'lever'
  if (url.includes('myworkdayjobs.com') || html.includes('workday')) return 'workday'
  if (url.includes('smartrecruiters.com')) return 'smartrecruiters'
  if (url.includes('bamboohr.com')) return 'bamboohr'
  if (url.includes('icims.com')) return 'icims'
  if (url.includes('ashbyhq.com')) return 'ashby'
  if (url.includes('recruitee.com')) return 'recruitee'
  return 'generic'
}

async function fillField(input, value) {
  if (!value || !input) return false
  input.focus()
  await humanDelay(100, 300)

  // Clear existing value
  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true }))

  // Set value character by character for React-based forms
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value)
  } else {
    input.value = value
  }

  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

async function handleSelect(select, resumeData) {
  const label = getFieldLabel(select).toLowerCase()
  const options = Array.from(select.options)

  // Country select
  if (label.includes('country') || label.includes('negara')) {
    const target = resumeData.country || 'Indonesia'
    const match = options.find(o =>
      o.text.toLowerCase().includes(target.toLowerCase())
    )
    if (match) {
      select.value = match.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
  }

  // Phone country code
  if (label.includes('phone country') || label.includes('country code')) {
    const match = options.find(o =>
      o.text.includes('Indonesia') || o.text.includes('+62')
    )
    if (match) {
      select.value = match.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
  }

  // For other selects, pick first non-empty option if required
  if (select.hasAttribute('required') && select.selectedIndex <= 0 && options.length > 1) {
    select.selectedIndex = 1
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  return false
}

async function uploadResume(fileInput, resumeUrl) {
  if (!resumeUrl) return false

  try {
    const response = await fetch(resumeUrl)
    const blob = await response.blob()
    const file = new File([blob], 'resume.pdf', { type: 'application/pdf' })
    const dt = new DataTransfer()
    dt.items.add(file)
    fileInput.files = dt.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

function findSubmitButton() {
  const buttons = document.querySelectorAll('button, input[type="submit"], a[class*="submit"]')
  const submitTexts = ['submit', 'apply', 'send', 'kirim', 'lamar', 'submit application', 'apply now']

  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || '').trim().toLowerCase()
    if (submitTexts.some(t => text.includes(t)) && !btn.disabled && btn.offsetParent !== null) {
      return btn
    }
  }
  return null
}

async function fillForm(resumeData) {
  const ats = detectATS()
  console.log('[Jobflow] Detected ATS:', ats)

  let filled = 0
  let total = 0

  // Fill text inputs and textareas
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea')

  for (const input of inputs) {
    if (input.offsetParent === null) continue // skip hidden
    if (input.value && input.value.trim()) continue // skip already filled

    total++
    const label = getFieldLabel(input)
    const key = matchField(label)

    if (key && resumeData[key]) {
      const success = await fillField(input, resumeData[key])
      if (success) filled++
      await humanDelay(200, 500)
    }
  }

  // Handle selects
  const selects = document.querySelectorAll('select')
  for (const select of selects) {
    if (select.offsetParent === null) continue
    await handleSelect(select, resumeData)
    await humanDelay(200, 400)
  }

  // Handle file upload (resume)
  const fileInputs = document.querySelectorAll('input[type="file"]')
  for (const fileInput of fileInputs) {
    if (fileInput.offsetParent === null) continue
    const label = getFieldLabel(fileInput).toLowerCase()
    if (label.includes('resume') || label.includes('cv') || label.includes('dokumen') || !label) {
      await uploadResume(fileInput, resumeData.resumeUrl)
    }
  }

  // Handle checkboxes (privacy/terms)
  const checkboxes = document.querySelectorAll('input[type="checkbox"]')
  for (const cb of checkboxes) {
    if (cb.offsetParent === null || cb.checked) continue
    const label = getFieldLabel(cb)
    if (label.includes('agree') || label.includes('consent') || label.includes('privacy') ||
        label.includes('terms') || label.includes('setuju') || label.includes('acknowledge')) {
      cb.checked = true
      cb.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }

  return { filled, total, ats }
}

async function handleATSApply(resumeData) {
  try {
    // Wait longer for SPA career pages to fully render
    await humanDelay(4000, 6000)

    // Some career pages use cookie consent — dismiss if present
    const cookieBtns = document.querySelectorAll('button')
    for (const btn of cookieBtns) {
      const t = btn.textContent.trim().toLowerCase()
      if (t.includes('accept') || t.includes('agree') || t.includes('got it') || t.includes('dismiss') || t.includes('close')) {
        if (btn.closest('[class*="cookie"], [class*="consent"], [class*="banner"], [id*="cookie"], [id*="consent"]')) {
          btn.click()
          await humanDelay(500, 1000)
          break
        }
      }
    }

    // Fill form
    const { filled, total, ats } = await fillForm(resumeData)
    console.log(`[Jobflow] Filled ${filled}/${total} fields on ${ats}`)

    // Try multi-page forms — click Next if available
    for (let step = 0; step < 5; step++) {
      await humanDelay(1000, 2000)

      const submitBtn = findSubmitButton()
      if (submitBtn) {
        const text = (submitBtn.textContent || submitBtn.value || '').trim().toLowerCase()
        if (text.includes('submit') || text.includes('apply') || text.includes('send') || text.includes('kirim')) {
          submitBtn.click()
          await humanDelay(3000, 5000)

          // Check for success
          const body = document.body.innerText.toLowerCase()
          if (body.includes('thank') || body.includes('submitted') || body.includes('received') ||
              body.includes('terima kasih') || body.includes('berhasil') || body.includes('application has been')) {
            return { status: 'applied', reason: `${ats}: ${filled}/${total} fields filled` }
          }
          // Even if no confirmation text, if we clicked submit, consider it done
          return { status: 'applied', reason: `${ats}: submitted, ${filled}/${total} fields` }
        }
      }

      // Look for Next/Continue button
      const nextBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const t = b.textContent.trim().toLowerCase()
        return (t.includes('next') || t.includes('continue') || t.includes('lanjut')) && !b.disabled
      })

      if (nextBtn) {
        nextBtn.click()
        await humanDelay(2000, 3000)
        // Fill new page fields
        await fillForm(resumeData)
      } else {
        break
      }
    }

    // No submit button found
    const submitBtn = findSubmitButton()
    if (submitBtn) {
      submitBtn.click()
      await humanDelay(3000, 5000)
      return { status: 'applied', reason: `${ats}: force submitted` }
    }

    return { status: 'needs_review', reason: `${ats}: no submit button found, ${filled}/${total} fields filled` }
  } catch (err) {
    return { status: 'failed', reason: err.message }
  }
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ATS_APPLY') {
    handleATSApply(message.resumeData).then(sendResponse)
    return true
  }
  if (message.action === 'PING') {
    sendResponse({ ok: true })
  }
})
