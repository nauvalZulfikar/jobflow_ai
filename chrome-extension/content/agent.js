// Universal apply agent — one script for all sites, all languages
// Injected dynamically by service worker (guard prevents double-execution)
if (window.__jobflowAgentLoaded) throw new Error('agent already loaded')
window.__jobflowAgentLoaded = true

const API_BASE = window.__jobflowApiBase || 'https://jobflow.aureonforge.com/api'

function humanDelay(min = 200, max = 600) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min))
}

// Scroll from top to bottom to trigger lazy-rendered content, then back
async function scrollToReveal() {
  const candidates = [
    document.querySelector('.artdeco-modal__content'),
    document.querySelector('[class*="modal__content"]'),
    document.querySelector('[class*="easy-apply"]'),
    document.querySelector('main'),
  ].filter(el => el && el.scrollHeight > el.clientHeight + 10)

  const scrollable = candidates[0] || document.documentElement

  scrollable.scrollTop = scrollable.scrollHeight
  await humanDelay(400, 600)
  scrollable.scrollTop = 0
  await humanDelay(200, 400)

  window.scrollTo(0, document.body.scrollHeight)
  await humanDelay(300, 400)
  window.scrollTo(0, 0)
  await humanDelay(200, 300)
}

function getSelector(el) {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${CSS.escape(el.id)}`
  const attrs = ['data-control-name', 'data-testid', 'data-test-id', 'data-automation-id', 'data-cy']
  for (const attr of attrs) {
    const v = el.getAttribute(attr)
    if (v) return `[${attr}="${v.replace(/"/g, '\\"')}"]`
  }
  if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label').replace(/"/g, '\\"')}"]`
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name.replace(/"/g, '\\"')}"]`
  return null
}

function getLabel(el) {
  const id = el.id || el.getAttribute('name') || ''
  if (id) {
    const lbl = document.querySelector(`label[for="${id}"]`)
    if (lbl) return lbl.textContent.trim()
  }
  const parentLabel = el.closest('label')
  if (parentLabel) return parentLabel.textContent.trim()
  const parent = el.closest('.field, .form-group, .form-field, [class*="field"], [class*="input"]')
  if (parent) {
    const lbl = parent.querySelector('label, [class*="label"]')
    if (lbl) return lbl.textContent.trim()
  }
  return el.placeholder || el.getAttribute('aria-label') || el.getAttribute('name') || ''
}

// Detect the active scope for scanning. Returns { root, modalOpen }.
// Priority: open modal/dialog (apply form) > LinkedIn detail panel > whole document.
// modalOpen=true means an actual apply-form dialog is shown (not just a detail panel).
function findScopeRoot() {
  const modalSelectors = [
    '[role="dialog"][aria-modal="true"]',
    '[role="dialog"]',
    '.artdeco-modal',
    '[class*="jobs-easy-apply"]',
    '[class*="easy-apply-modal"]',
    '[class*="Modal"][class*="open"]',
  ]
  for (const sel of modalSelectors) {
    const el = document.querySelector(sel)
    if (el && el.offsetParent !== null) return { root: el, modalOpen: true }
  }
  // No modal open — try LinkedIn detail panel so we ignore the job-list sidebar
  const detailSelectors = ['.jobs-details', '.scaffold-layout__detail']
  for (const sel of detailSelectors) {
    const el = document.querySelector(sel)
    if (el && el.offsetParent !== null) return { root: el, modalOpen: false }
  }
  return { root: document, modalOpen: false }
}

// True if an element is LinkedIn/nav chrome we should ignore
function isChrome(el) {
  if (el.closest('nav, header, footer, [role="navigation"], [role="banner"]')) return true
  // LinkedIn-specific class-based nav (uses <div class="global-nav">, not <nav>)
  const chromeClassRx = /(^|\s)(global-nav|top-bar|site-header|app-header|artdeco-nav|artdeco-pill|header-bar)(\s|$|__|--)/i
  let p = el
  for (let i = 0; i < 8 && p; i++) {
    if (p.className && typeof p.className === 'string' && chromeClassRx.test(p.className)) return true
    p = p.parentElement
  }
  return false
}

async function getPageState() {
  await scrollToReveal()

  const fields = []
  const buttons = []
  const seen = new Set()
  const { root, modalOpen } = findScopeRoot()
  const scoped = root !== document

  // Native form fields
  for (const el of root.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select'
  )) {
    if (el.offsetParent === null) continue
    if (!scoped && isChrome(el)) continue
    const selector = getSelector(el)
    if (!selector || seen.has(selector)) continue
    seen.add(selector)

    const field = {
      selector,
      type: el.type || el.tagName.toLowerCase(),
      label: getLabel(el).slice(0, 120),
      value: (el.value || '').slice(0, 200),
      required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    }
    if (el.tagName === 'SELECT') {
      field.options = Array.from(el.options).map(o => ({ value: o.value, text: o.text })).slice(0, 30)
    }
    fields.push(field)
  }

  // Custom dropdowns
  for (const el of root.querySelectorAll('[role="combobox"]:not(select), [aria-haspopup="listbox"]:not(select)')) {
    if (el.offsetParent === null) continue
    if (!scoped && isChrome(el)) continue
    const selector = getSelector(el)
    if (!selector || seen.has(selector)) continue
    seen.add(selector)
    fields.push({
      selector,
      type: 'custom-dropdown',
      label: getLabel(el).slice(0, 120),
      value: (el.textContent || '').trim().slice(0, 100),
    })
  }

  // Visible buttons — scoped to modal if open, else filter nav chrome.
  // Include <a> with aria-label or role="button" — modern LinkedIn UI renders Apply as <a>.
  for (const el of root.querySelectorAll(
    'button, input[type="submit"], [role="button"], a[aria-label], a[role="button"]'
  )) {
    if (el.disabled || el.offsetParent === null) continue
    if (!scoped && isChrome(el)) continue
    const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim()
    if (!text || text.length > 100) continue
    // Skip anchors that are just navigation links (no aria-label and no explicit button role)
    if (el.tagName === 'A' && !el.getAttribute('aria-label') && el.getAttribute('role') !== 'button') continue
    const selector = getSelector(el)
    if (!selector || seen.has(selector)) continue
    seen.add(selector)
    buttons.push({ selector, text: text.slice(0, 80) })
  }

  return {
    url: location.href,
    title: document.title.slice(0, 100),
    fields,
    buttons,
    bodyText: (modalOpen ? root.innerText : document.body.innerText).slice(0, 1500),
    modalOpen,
  }
}

async function fillField(input, value) {
  if (!input || value == null) return false
  input.focus()
  await humanDelay(60, 160)
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.dispatchEvent(new Event('blur', { bubbles: true }))
  return true
}

async function executeActions(actions) {
  const results = []
  for (const act of actions) {
    try {
      if (act.action === 'upload') {
        results.push({ ok: true, skipped: true })
        continue
      }

      const el = document.querySelector(act.selector)
      if (!el) { results.push({ ok: false, selector: act.selector, reason: 'not_found' }); continue }
      if (el.offsetParent === null) { results.push({ ok: false, selector: act.selector, reason: 'hidden' }); continue }

      if (act.action === 'click') {
        // Radio/checkbox inputs in LinkedIn-style forms: the visible UI is rendered on a label,
        // not the input itself. Clicking the raw input doesn't trigger the handler.
        if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
          const label = el.id
            ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
            : el.closest('label')
          if (label && label.offsetParent !== null) label.click()
          else el.click()
          if (!el.checked) {
            el.checked = true
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        } else if (el.tagName === 'A' && el.href) {
          // Anchor with href: SPA click handlers (LinkedIn, etc) often swallow programmatic
          // clicks. Navigating via location.href triggers a proper page load — this works for
          // both LinkedIn Easy Apply (loads /apply/ page with modal) and external ATS redirects.
          window.location.href = el.href
        } else {
          el.click()
        }
        results.push({ ok: true })

      } else if (act.action === 'type') {
        const ok = await fillField(el, String(act.value ?? ''))
        results.push({ ok })

      } else if (act.action === 'select') {
        if (el.tagName === 'SELECT') {
          const opt = Array.from(el.options).find(o =>
            o.value.toLowerCase() === String(act.value).toLowerCase() ||
            o.text.toLowerCase().includes(String(act.value).toLowerCase())
          )
          if (opt) {
            el.value = opt.value
            el.dispatchEvent(new Event('change', { bubbles: true }))
            results.push({ ok: true })
          } else {
            results.push({ ok: false, reason: 'option_not_found' })
          }
        } else {
          el.click()
          await humanDelay(400, 700)
          const opts = document.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"]')
          const match = Array.from(opts).find(o =>
            o.offsetParent !== null &&
            o.textContent.trim().toLowerCase().includes(String(act.value).toLowerCase())
          )
          if (match) {
            match.click()
            results.push({ ok: true })
          } else {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            results.push({ ok: false, reason: 'custom_option_not_found' })
          }
        }

      } else if (act.action === 'check') {
        if (!el.checked) el.click()
        results.push({ ok: true })
      }

      await humanDelay(150, 350)
    } catch (err) {
      results.push({ ok: false, selector: act.selector, reason: err.message })
    }
  }
  return results
}

async function uploadResume(resumeUrl) {
  const fileInput = document.querySelector('input[type="file"]')
  if (!fileInput || fileInput.offsetParent === null) return false
  let blob = null
  if (resumeUrl) {
    try { const r = await fetch(resumeUrl); if (r.ok) blob = await r.blob() } catch {}
  }
  if (!blob) {
    try {
      const { cachedResumeData } = await chrome.storage.local.get('cachedResumeData')
      if (cachedResumeData) { const r = await fetch(cachedResumeData); blob = await r.blob() }
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
  } catch { return false }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_PAGE_STATE') {
    getPageState().then(sendResponse)
    return true
  }
  if (message.action === 'EXECUTE_ACTIONS') {
    executeActions(message.actions).then(sendResponse)
    return true
  }
  if (message.action === 'UPLOAD_RESUME') {
    uploadResume(message.resumeUrl).then(ok => sendResponse({ ok }))
    return true
  }
  if (message.action === 'PING') {
    sendResponse({ ok: true })
  }
})
