// Generic ATS form filler — handles Greenhouse, Lever, Workday, and any career page
// Injected dynamically by background service worker on external apply pages

function humanDelay(min = 500, max = 1500) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min))
}

// Adaptive timeouts per ATS platform — slow platforms get more time
const PLATFORM_TIMEOUTS = {
  workday: { element: 15000, form: 12000, settle: 5000, extraWait: 12000 },
  icims: { element: 12000, form: 10000, settle: 3000, extraWait: 8000 },
  smartrecruiters: { element: 10000, form: 8000, settle: 2000, extraWait: 6000 },
  ashby: { element: 10000, form: 8000, settle: 2000, extraWait: 6000 },
  greenhouse: { element: 8000, form: 6000, settle: 1500, extraWait: 5000 },
  lever: { element: 8000, form: 6000, settle: 1500, extraWait: 5000 },
  bamboohr: { element: 8000, form: 6000, settle: 1500, extraWait: 5000 },
  recruitee: { element: 8000, form: 6000, settle: 1500, extraWait: 5000 },
  generic: { element: 8000, form: 5000, settle: 2000, extraWait: 5000 },
}

function getTimeouts(ats) {
  return PLATFORM_TIMEOUTS[ats] || PLATFORM_TIMEOUTS.generic
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

// Platform-specific configurations for top ATS platforms
const ATS_CONFIGS = {
  greenhouse: {
    detect: (url, html) => url.includes('greenhouse.io') || url.includes('boards.greenhouse') || html.includes('greenhouse'),
    formSelector: '#application-form, #application_form, form[action*="greenhouse"]',
    submitSelector: 'input[type="submit"][value*="Submit"], button[type="submit"], #submit_app, button[data-testid="submit-application"]',
    resumeSelector: 'input[type="file"]#resume, input[type="file"][name*="resume"], input[type="file"]:first-of-type',
    waitForForm: 3000,
  },
  lever: {
    detect: (url, html) => url.includes('lever.co') || url.includes('jobs.lever') || html.includes('lever-'),
    formSelector: '.application-form, .postings-btn-wrapper, form[action*="lever"]',
    submitSelector: 'button.postings-btn[type="submit"], button[type="submit"], .postings-btn-wrapper button',
    resumeSelector: 'input[type="file"][name="resume"], input[type="file"]',
    waitForForm: 3000,
  },
  workday: {
    detect: (url, html) => url.includes('myworkdayjobs.com') || url.includes('workday.com') || html.includes('workday'),
    formSelector: 'div[data-automation-id="jobApplication"], div[data-automation-id="applyManually"], form[data-automation-id]',
    submitSelector: 'button[data-automation-id="bottom-navigation-next-button"], button[data-automation-id="submit"], button[aria-label="Submit"]',
    resumeSelector: 'input[data-automation-id="file-upload-input-ref"], input[type="file"]',
    waitForForm: 8000, // Workday is notoriously slow
  },
  icims: {
    detect: (url) => url.includes('icims.com') || url.includes('careers-'),
    formSelector: '#iCIMS_MainWrapper form, iframe#icims_content_iframe',
    submitSelector: 'input[type="submit"], button[type="submit"], .iCIMS_Button',
    resumeSelector: 'input[type="file"]',
    waitForForm: 5000,
    usesIframe: true,
  },
  ashby: {
    detect: (url, html) => url.includes('ashbyhq.com') || url.includes('jobs.ashby') || html.includes('ashby'),
    formSelector: 'form[class*="application"], form._form, div[class*="ApplicationForm"]',
    submitSelector: 'button[type="submit"], button[class*="submit"]',
    resumeSelector: 'input[type="file"]',
    waitForForm: 4000,
  },
  smartrecruiters: {
    detect: (url) => url.includes('smartrecruiters.com') || url.includes('jobs.smartrecruiters'),
    formSelector: 'form.application-form, div[data-test="application-form"], form',
    submitSelector: 'button[data-test="footer-submit"], button[type="submit"]',
    resumeSelector: 'input[type="file"]',
    waitForForm: 4000,
  },
  bamboohr: {
    detect: (url) => url.includes('bamboohr.com'),
    formSelector: 'form#applicationForm, form[class*="application"]',
    submitSelector: 'button[type="submit"], input[type="submit"]',
    resumeSelector: 'input[type="file"]',
    waitForForm: 3000,
  },
  recruitee: {
    detect: (url) => url.includes('recruitee.com') || url.includes('careers.'),
    formSelector: 'form[class*="application"], div[class*="application-form"]',
    submitSelector: 'button[type="submit"]',
    resumeSelector: 'input[type="file"]',
    waitForForm: 3000,
  },
}

function detectATS() {
  const url = window.location.href.toLowerCase()
  const html = document.body?.innerHTML?.substring(0, 5000)?.toLowerCase() || ''

  for (const [name, config] of Object.entries(ATS_CONFIGS)) {
    if (config.detect(url, html)) return name
  }
  return 'generic'
}

async function fillField(input, value) {
  if (!value || !input) return false
  input.focus()
  await humanDelay(100, 300)

  // Clear existing value
  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true }))

  // Set value via the native prototype setter so React-controlled inputs
  // see the change. Must pick the correct prototype for the element type —
  // calling HTMLInputElement's setter on a textarea throws Illegal invocation.
  const proto = input.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

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

  const setValue = (val) => {
    select.value = val
    select.dispatchEvent(new Event('change', { bubbles: true }))
    select.dispatchEvent(new Event('blur', { bubbles: true }))
    return true
  }
  const pickOption = (predicate) => {
    const match = options.find(predicate)
    return match ? setValue(match.value) : false
  }

  // Country / location selects
  if (label.includes('country') || label.includes('negara') || label.includes('location') || label.includes('lokasi')) {
    const target = (resumeData.country || 'Indonesia').toLowerCase()
    if (pickOption(o => o.text.toLowerCase().includes(target))) return true
  }

  // Phone country code
  if (label.includes('phone country') || label.includes('country code')) {
    if (pickOption(o => o.text.includes('Indonesia') || o.text.includes('+62'))) return true
  }

  // EEOC / self-identification selects — prefer a non-disclosure answer
  // because these questions are optional and selecting a real answer
  // without user consent would be wrong.
  const isEEOC = (
    label.includes('gender') ||
    label.includes('race') ||
    label.includes('ethnic') ||
    label.includes('veteran') ||
    label.includes('disability') ||
    label.includes('hispanic')
  )
  if (isEEOC) {
    const declinePatterns = [
      'decline to self-identify',
      "don't wish to answer",
      'do not wish to answer',
      'prefer not to',
      'i do not',
      'decline to answer',
      'not specified',
      'decline',
      'prefer not',
    ]
    for (const p of declinePatterns) {
      if (pickOption(o => o.text.toLowerCase().includes(p))) return true
    }
    // Last resort: pick the last option (conventionally "decline" on EEOC forms)
    if (select.hasAttribute('required') && options.length > 1) {
      return setValue(options[options.length - 1].value)
    }
  }

  // Yes/No-style selects — default to the affirmative for "are you legally
  // authorized / eligible" questions, negative for "require sponsorship".
  if (options.length <= 4) {
    const yesOpt = options.find(o => /^(yes|ya)\b/i.test(o.text.trim()))
    const noOpt  = options.find(o => /^(no|tidak)\b/i.test(o.text.trim()))
    if (yesOpt && noOpt) {
      if (label.includes('sponsor') || label.includes('visa')) return setValue(noOpt.value)
      if (label.includes('authori') || label.includes('eligib') || label.includes('legal')) return setValue(yesOpt.value)
    }
  }

  // For other selects, pick first non-empty option if required
  if (select.hasAttribute('required') && select.selectedIndex <= 0 && options.length > 1) {
    return setValue(options[1].value)
  }

  return false
}

async function fetchResumeBlob(resumeUrl, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(resumeUrl)
      if (response.ok) return await response.blob()
    } catch {}
    if (i < retries) await humanDelay(1000, 2000)
  }
  return null
}

async function uploadResume(fileInput, resumeUrl) {
  let blob = null

  // Try fetching with retries
  if (resumeUrl) {
    blob = await fetchResumeBlob(resumeUrl)

    // Cache on success
    if (blob) {
      try {
        const reader = new FileReader()
        const base64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
        await chrome.storage.local.set({ cachedResumeData: base64, cachedResumeUrl: resumeUrl })
      } catch {}
    }
  }

  // Fallback: cached resume
  if (!blob) {
    try {
      const { cachedResumeData } = await chrome.storage.local.get('cachedResumeData')
      if (cachedResumeData) {
        const res = await fetch(cachedResumeData)
        blob = await res.blob()
        console.log('[Jobflow] Using cached resume fallback')
      }
    } catch {}
  }

  if (!blob) return false

  try {
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

function findSubmitButton(ats) {
  // Try platform-specific selector first
  const config = ATS_CONFIGS[ats]
  if (config?.submitSelector) {
    const el = document.querySelector(config.submitSelector)
    if (el && !el.disabled && el.offsetParent !== null) return el
  }

  // Generic fallback
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

function getIframeDocument() {
  // Some career pages embed forms in iframes (Workday, iCIMS, etc.)
  const iframes = document.querySelectorAll('iframe')
  for (const iframe of iframes) {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc && doc.querySelector('form, input, button[type="submit"]')) {
        return doc
      }
    } catch {
      // Cross-origin iframe — can't access
    }
  }
  return null
}

function isLoginPage() {
  const url = window.location.href.toLowerCase()

  // DOM-based detection — most reliable signal
  // Login/register pages have a visible password field + very few other inputs
  // Apply forms have many inputs (name, email, phone, etc.) + often file upload
  const hasPasswordField = Array.from(
    document.querySelectorAll('input[type="password"]')
  ).some(el => el.offsetParent !== null)

  const hasResumeUpload = !!document.querySelector('input[type="file"]')

  // Count visible non-trivial inputs (exclude password, hidden, submit, button, checkbox, radio, file)
  const visibleInputCount = Array.from(
    document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea')
  ).filter(el => el.offsetParent !== null).length

  // Password field + few inputs + no file upload → login or registration page
  // Login: email + password → 1 visible non-password input
  // Register: name + email + password → 2-3 visible non-password inputs
  // Apply form: name + email + phone + linkedin + ... → 4+ visible inputs
  if (hasPasswordField && visibleInputCount <= 3 && !hasResumeUpload) {
    return true
  }

  // URL-based fallback for pages that haven't rendered form yet
  const loginPaths = ['/login', '/signin', '/sign-in', '/log-in', '/users/sign_in', '/account/login', '/masuk']
  if (loginPaths.some(p => url.includes(p)) && !hasResumeUpload && visibleInputCount <= 3) {
    return true
  }

  return false
}

async function waitForForm(ats) {
  const config = ATS_CONFIGS[ats]
  const timeouts = getTimeouts(ats)
  if (config?.formSelector) {
    const el = await waitForElement(config.formSelector, timeouts.form)
    if (el) return el
  }
  // Generic fallback: wait for any form with adaptive timeout
  return await waitForElement('form, [class*="application"], [class*="apply"]', timeouts.form)
}

async function handleATSApply(resumeData) {
  try {
    const ats = detectATS()
    const config = ATS_CONFIGS[ats]
    console.log(`[Jobflow] Detected ATS: ${ats}`)

    // Wait for platform-specific form element with adaptive timeout
    const timeouts = getTimeouts(ats)
    await waitForForm(ats)
    await humanDelay(timeouts.settle, timeouts.settle + 1000) // adaptive settle delay

    // Check if this is a login/auth page — can't auto-apply
    if (isLoginPage()) {
      return { status: 'needs_review', reason: 'login_required' }
    }

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

    // Handle iframe-based ATS (iCIMS, some Workday) first
    if (config?.usesIframe) {
      const iframeDoc = getIframeDocument()
      if (iframeDoc) {
        console.log(`[Jobflow] ${ats}: using iframe form`)
        let filled = 0, total = 0
        const iframeInputs = iframeDoc.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea')
        for (const input of iframeInputs) {
          if (input.offsetParent === null) continue
          if (input.value && input.value.trim()) continue
          total++
          const label = getFieldLabel(input)
          const key = matchField(label)
          if (key && resumeData[key]) {
            const success = await fillField(input, resumeData[key])
            if (success) filled++
            await humanDelay(200, 500)
          }
        }
        // Try submit inside iframe
        const iframeSubmit = iframeDoc.querySelector(config.submitSelector || 'input[type="submit"], button[type="submit"]')
        if (iframeSubmit && !iframeSubmit.disabled) {
          iframeSubmit.click()
          await humanDelay(3000, 5000)
          return { status: 'applied', reason: `${ats}: iframe submitted, ${filled}/${total} fields` }
        }
        return { status: 'needs_review', reason: `${ats}: iframe form, no submit button, ${filled}/${total} fields filled` }
      }
    }

    // Fill form on main document
    let { filled, total } = await fillForm(resumeData)
    console.log(`[Jobflow] Filled ${filled}/${total} fields on ${ats}`)

    // Handle platform-specific resume upload if generic missed it
    if (config?.resumeSelector && resumeData.resumeUrl) {
      const resumeInput = document.querySelector(config.resumeSelector)
      if (resumeInput && resumeInput.offsetParent !== null) {
        await uploadResume(resumeInput, resumeData.resumeUrl)
        await humanDelay(1000, 2000)
      }
    }

    // If no fields found, check for iframe-embedded forms (non-configured ATS)
    if (total === 0) {
      const iframeDoc = getIframeDocument()
      if (iframeDoc) {
        console.log('[Jobflow] Trying iframe form...')
        const iframeInputs = iframeDoc.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea')
        for (const input of iframeInputs) {
          if (input.offsetParent === null) continue
          if (input.value && input.value.trim()) continue
          total++
          const label = getFieldLabel(input)
          const key = matchField(label)
          if (key && resumeData[key]) {
            const success = await fillField(input, resumeData[key])
            if (success) filled++
            await humanDelay(200, 500)
          }
        }
      }
    }

    // If still no fields, page might need more time (heavy SPA like Workday)
    if (total === 0) {
      const extraWait = timeouts.extraWait
      await humanDelay(extraWait, extraWait + 3000)
      const retry = await fillForm(resumeData)
      filled = retry.filled
      total = retry.total
    }

    // Guard: if there are no form fields at all, we are almost certainly on a
    // listings page, not an application form. Bail out with a clear reason
    // rather than clicking a random "Apply" button and claiming success.
    if (total === 0) {
      return { status: 'failed', reason: `${ats}: no_form_fields_found` }
    }

    // Try multi-page forms — click Next if available
    for (let step = 0; step < 5; step++) {
      await humanDelay(1000, 2000)

      const submitBtn = findSubmitButton(ats)
      if (submitBtn) {
        const text = (submitBtn.textContent || submitBtn.value || '').trim().toLowerCase()
        if (text.includes('submit') || text.includes('apply') || text.includes('send') || text.includes('kirim')) {
          const prevUrl = location.href
          submitBtn.click()
          await humanDelay(3000, 5000)

          // Check for success via confirmation text
          const body = document.body.innerText.toLowerCase()
          const confirmed = body.includes('thank') || body.includes('submitted') || body.includes('received') ||
                            body.includes('terima kasih') || body.includes('berhasil') || body.includes('application has been')
          if (confirmed) {
            return { status: 'applied', reason: `${ats}: ${filled}/${total} fields filled` }
          }

          // No confirmation text — be strict. Only call it applied if we actually
          // filled fields AND the URL changed or the form disappeared.
          const urlChanged = location.href !== prevUrl
          const formGone = !document.querySelector('form input:not([type="hidden"]), form textarea')
          if (filled > 0 && (urlChanged || formGone)) {
            return { status: 'applied', reason: `${ats}: submitted (no confirmation text), ${filled}/${total} fields` }
          }
          // Otherwise flag for review instead of optimistically claiming success
          return { status: 'needs_review', reason: `${ats}: clicked_submit_no_confirmation, ${filled}/${total} fields` }
        }
      }

      // Look for Next/Continue button (platform-aware for Workday)
      let nextBtn
      if (ats === 'workday') {
        nextBtn = document.querySelector('button[data-automation-id="bottom-navigation-next-button"]')
      }
      if (!nextBtn) {
        nextBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const t = b.textContent.trim().toLowerCase()
          return (t.includes('next') || t.includes('continue') || t.includes('lanjut')) && !b.disabled
        })
      }

      if (nextBtn) {
        nextBtn.click()
        await humanDelay(2000, 3000)
        // Fill new page fields
        await fillForm(resumeData)
      } else {
        break
      }
    }

    // Final attempt: find and click submit — but only consider it applied if
    // we actually filled something and got visible confirmation.
    const submitBtn = findSubmitButton(ats)
    if (submitBtn && filled > 0) {
      const prevUrl = location.href
      submitBtn.click()
      await humanDelay(3000, 5000)
      const body = document.body.innerText.toLowerCase()
      const confirmed = body.includes('thank') || body.includes('submitted') || body.includes('received') ||
                        body.includes('terima kasih') || body.includes('berhasil') || body.includes('application has been')
      if (confirmed || location.href !== prevUrl) {
        return { status: 'applied', reason: `${ats}: force submitted (${filled}/${total} fields)` }
      }
      return { status: 'needs_review', reason: `${ats}: force_submit_no_confirmation, ${filled}/${total} fields` }
    }

    return { status: 'needs_review', reason: `${ats}: no submit button found, ${filled}/${total} fields filled` }
  } catch (err) {
    return { status: 'failed', reason: err.message }
  }
}

function captureDomSnippet(maxLen = 8000) {
  const forms = document.querySelectorAll('form')
  if (forms.length > 0) {
    return Array.from(forms).map(f => f.outerHTML).join('\n').slice(0, maxLen)
  }
  const hosts = document.querySelectorAll('[class*="apply"], [id*="apply"], main, body')
  for (const h of hosts) {
    if (h.querySelector('input, textarea, select')) return h.outerHTML.slice(0, maxLen)
  }
  return document.body?.innerHTML?.slice(0, maxLen) || ''
}

async function executeFieldInstructions(fields) {
  let filled = 0
  const errors = []
  for (const f of fields || []) {
    try {
      const el = document.querySelector(f.selector)
      if (!el) { errors.push({ selector: f.selector, error: 'not_found' }); continue }
      if (el.offsetParent === null) { errors.push({ selector: f.selector, error: 'hidden' }); continue }
      if (el.tagName === 'SELECT') {
        const options = Array.from(el.options)
        const match = options.find(o =>
          String(o.value).toLowerCase() === String(f.value).toLowerCase() ||
          o.text.toLowerCase().includes(String(f.value).toLowerCase())
        )
        if (match) { el.value = match.value; el.dispatchEvent(new Event('change', { bubbles: true })); filled++ }
        else errors.push({ selector: f.selector, error: 'no_matching_option' })
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        if (!el.checked) { el.click(); filled++ }
      } else {
        const ok = await fillField(el, String(f.value))
        if (ok) filled++
      }
      await humanDelay(200, 500)
    } catch (err) {
      errors.push({ selector: f.selector, error: err.message })
    }
  }
  return { filled, errors }
}

async function executeAction(step) {
  try {
    if (step.action === 'click') {
      const el = document.querySelector(step.selector)
      if (!el) return { ok: false, reason: 'not_found' }
      el.click()
      return { ok: true }
    }
    if (step.action === 'type') {
      const el = document.querySelector(step.selector)
      if (!el) return { ok: false, reason: 'not_found' }
      await fillField(el, String(step.value ?? ''))
      return { ok: true }
    }
    if (step.action === 'wait') {
      await new Promise(r => setTimeout(r, Math.min(Math.max(Number(step.ms) || 1000, 200), 10000)))
      return { ok: true }
    }
    return { ok: false, reason: 'unknown_action' }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ATS_APPLY') {
    handleATSApply(message.resumeData).then(sendResponse)
    return true
  }
  if (message.action === 'GET_DOM_SNIPPET') {
    sendResponse({ domSnippet: captureDomSnippet(message.maxLen || 8000), url: location.href })
    return
  }
  if (message.action === 'EXECUTE_FIELDS') {
    executeFieldInstructions(message.fields).then(sendResponse)
    return true
  }
  if (message.action === 'EXECUTE_ACTION') {
    executeAction(message.step).then(sendResponse)
    return true
  }
  if (message.action === 'CLICK_SUBMIT') {
    try {
      const btn = document.querySelector(message.selector)
      if (btn) { btn.click(); sendResponse({ ok: true }) } else { sendResponse({ ok: false, reason: 'not_found' }) }
    } catch (err) { sendResponse({ ok: false, reason: err.message }) }
    return
  }
  if (message.action === 'PING') {
    sendResponse({ ok: true })
  }
})
