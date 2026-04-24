// Test agent.js getPageState against real logged-in LinkedIn HTML
import { JSDOM } from 'jsdom'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const agentSrc = readFileSync(resolve(__dirname, '../../chrome-extension/content/agent.js'), 'utf8')
const html = readFileSync(resolve(__dirname, 'fixtures/linkedin-logged-in.html'), 'utf8')

const dom = new JSDOM(html, { url: 'https://www.linkedin.com/jobs/view/4382121441/' })
const { window } = dom

// jsdom quirks + chrome extension globals
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

const stripped = agentSrc
  .replace(/^if \(window\.__jobflowAgentLoaded\).*$/m, '')
  .replace(/^window\.__jobflowAgentLoaded = true$/m, '')

const fn = new window.Function('window', 'document', 'location', 'CSS', 'chrome', `
  ${stripped}
  return getPageState()
`)

const state = await fn(window, window.document, window.location, window.CSS, window.chrome)

// Report actual state for debugging
console.log('=== SCAN RESULT ===')
console.log(`modalOpen: ${state.modalOpen}`)
console.log(`fields: ${state.fields.length}`)
state.fields.forEach((f, i) => console.log(`  [${i}] ${f.selector} (${f.type}) — "${f.label}"`))
console.log(`buttons: ${state.buttons.length}`)
state.buttons.forEach((b, i) => console.log(`  [${i}] ${b.selector} → "${b.text}"`))
console.log('')

// Assertions
const assertions = []

// 1. Easy Apply button detected
const easyApply = state.buttons.find(b => /easy apply/i.test(b.text))
assertions.push({
  name: 'Easy Apply button detected',
  pass: !!easyApply,
  detail: easyApply ? `selector: ${easyApply.selector}` : `not found in ${state.buttons.length} buttons`,
})

// 2. Scoped to detail panel (not whole page with 24+ buttons)
assertions.push({
  name: 'Scoped to detail panel (≤15 buttons)',
  pass: state.buttons.length <= 15,
  detail: `${state.buttons.length} buttons`,
})

// 3. No list-panel noise (swipe nav buttons)
const noiseTexts = ['Previous', 'Next', 'Save']
const leaked = state.buttons.filter(b => noiseTexts.some(n => b.text === n))
assertions.push({
  name: 'List panel noise filtered',
  pass: leaked.length === 0,
  detail: leaked.length ? `leaked: ${leaked.map(b => b.text).join(', ')}` : 'clean',
})

// 4. No search bar leaked into fields
const searchField = state.fields.find(f => /search/i.test(f.label) || /keyword/i.test(f.label))
assertions.push({
  name: 'Search bar not leaked into fields',
  pass: !searchField,
  detail: searchField ? `leaked: ${searchField.label}` : 'clean',
})

// 5. URL recognized as LinkedIn job page (modalOpen=false expected — no Easy Apply clicked yet)
assertions.push({
  name: 'modalOpen=false before apply click',
  pass: state.modalOpen === false,
  detail: `modalOpen=${state.modalOpen}`,
})

console.log('=== ASSERTIONS ===')
let passed = 0
for (const a of assertions) {
  console.log(`${a.pass ? '✅' : '❌'} ${a.name} — ${a.detail}`)
  if (a.pass) passed++
}
console.log(`\n${passed}/${assertions.length} passed`)
process.exit(passed === assertions.length ? 0 : 1)
