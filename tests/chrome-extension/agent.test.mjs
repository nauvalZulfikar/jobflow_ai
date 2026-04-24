// Test agent.js getPageState against simulated LinkedIn DOM
import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'

const agentSrc = readFileSync(
  new URL('../../chrome-extension/content/agent.js', import.meta.url),
  'utf8',
)

function runTest(name, html, expectations) {
  const dom = new JSDOM(html, { url: 'https://www.linkedin.com/jobs/view/123' })
  const { window } = dom

  // Stub: make all visible elements have offsetParent (jsdom quirk)
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    get() { return this.parentElement },
    configurable: true,
  })
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() { return this.textContent },
    configurable: true,
  })
  window.chrome = { runtime: { onMessage: { addListener: () => {} } } }
  window.HTMLElement.prototype.scrollTo = () => {}
  window.CSS = { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&') }

  // Inject agent.js into the JSDOM window — wrap in function to use its `window`
  const stripped = agentSrc
    .replace(/^if \(window\.__jobflowAgentLoaded\).*$/m, '')
    .replace(/^window\.__jobflowAgentLoaded = true$/m, '')

  const fn = new window.Function('window', 'document', 'location', 'CSS', 'chrome', `
    ${stripped}
    return getPageState()
  `)

  return fn(window, window.document, window.location, window.CSS, window.chrome).then(state => {
    const failures = []
    for (const [key, expected] of Object.entries(expectations)) {
      const actual = key.split('.').reduce((o, k) => o?.[k], state)
      if (typeof expected === 'function') {
        const err = expected(actual, state)
        if (err) failures.push(`${key}: ${err}`)
      } else if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    }
    if (failures.length === 0) {
      console.log(`✅ ${name}`)
    } else {
      console.log(`❌ ${name}`)
      failures.forEach(f => console.log(`   ${f}`))
      console.log('   state:', JSON.stringify({ fields: state.fields, buttons: state.buttons, modalOpen: state.modalOpen }, null, 2))
    }
    return failures.length === 0
  })
}

// Test 1: LinkedIn-like job detail page (no modal) — nav buttons should be filtered
const test1 = runTest(
  'Nav chrome filtered on job detail page',
  `<html><body>
    <div class="global-nav">
      <button id="nav-home">Home</button>
      <button id="nav-biz">For Business</button>
      <button id="nav-menu" aria-label="Close jump menu">X</button>
    </div>
    <main>
      <h1>Senior Engineer at Google</h1>
      <button id="ease-apply" data-control-name="jobdetails_topcard_inapply">Easy Apply</button>
      <button id="save-btn" data-control-name="save_job">Save</button>
    </main>
  </body></html>`,
  {
    modalOpen: false,
    'buttons': (btns) => {
      const texts = btns.map(b => b.text)
      if (texts.includes('Home') || texts.includes('For Business') || texts.includes('Close jump menu')) {
        return `nav chrome leaked: ${JSON.stringify(texts)}`
      }
      if (!texts.includes('Easy Apply')) return `Easy Apply missing: ${JSON.stringify(texts)}`
      return null
    },
  },
)

// Test 2: Modal open — scan should scope to modal only
const test2 = runTest(
  'Modal scope when apply modal open',
  `<html><body>
    <div class="global-nav">
      <button id="nav-home">Home</button>
    </div>
    <main>
      <button id="ease-apply">Easy Apply</button>
    </main>
    <div role="dialog" aria-modal="true" class="artdeco-modal">
      <form>
        <label for="first">First Name</label>
        <input id="first" name="firstName" type="text" />
        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" />
        <button id="next-btn" data-control-name="continue_unify">Next</button>
      </form>
    </div>
  </body></html>`,
  {
    modalOpen: true,
    'fields': (fields) => {
      const sels = fields.map(f => f.selector)
      if (!sels.includes('#first') || !sels.includes('#phone')) {
        return `modal fields missing: ${JSON.stringify(sels)}`
      }
      return null
    },
    'buttons': (btns) => {
      const texts = btns.map(b => b.text)
      if (texts.includes('Home') || texts.includes('Easy Apply')) {
        return `outside-modal leaked: ${JSON.stringify(texts)}`
      }
      if (!texts.includes('Next')) return `Next button missing: ${JSON.stringify(texts)}`
      return null
    },
  },
)

// Test 3: Plain form page (no nav, no modal) — should capture everything
const test3 = runTest(
  'Plain form captured normally',
  `<html><body>
    <form>
      <label for="name">Name</label><input id="name" type="text" />
      <label for="email">Email</label><input id="email" type="email" />
      <button id="submit-btn" type="submit">Submit Application</button>
    </form>
  </body></html>`,
  {
    modalOpen: false,
    'fields.length': 2,
    'buttons': (btns) => btns.some(b => b.text === 'Submit Application') ? null : `Submit missing`,
  },
)

Promise.all([test1, test2, test3]).then(results => {
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
})
