// Real-extension E2E: load the Chrome extension, trigger Start Auto-Apply,
// verify the flow reaches the Easy Apply modal. Stops before submit.
//
// MODE=local  → extension talks to localhost:3001/api, local JWT secret
// MODE=prod   → extension talks to jobflow.aureonforge.com/api, prod JWT secret (default)

import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const EXT_PATH = resolve(ROOT, 'chrome-extension')
const CONFIG_PATH = resolve(ROOT, 'chrome-extension/lib/config.js')
// Reuse the Chrome-debug profile (from Fase B) so LinkedIn/jobflow login persists.
const USER_DATA_DIR = process.env.USER_DATA_DIR || 'D:/temp-chrome-jobflow'
const OUT_DIR = resolve(ROOT, 'tmp/e2e-extension')
mkdirSync(USER_DATA_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

const MODE = process.env.MODE || 'prod'
const LOCAL_USER_ID = 'cmng4rn8b0000hfw78sj6fb2n'  // from local DB after prod dump restore
const PROD_USER_ID = 'cmng4rn8b0000hfw78sj6fb2n'   // same since local was restored from prod
const LOCAL_SECRET = 'local-dev-secret-for-extension-log-testing-only'

const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args)

async function makeLocalToken() {
  const key = new TextEncoder().encode(LOCAL_SECRET)
  return await new SignJWT({ id: LOCAL_USER_ID })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key)
}

// For prod, we need a token signed with prod's NEXTAUTH_SECRET — we don't have it here,
// so the user must paste one from https://jobflow.aureonforge.com/settings.
async function makeProdToken() {
  if (process.env.PROD_TOKEN) return process.env.PROD_TOKEN
  throw new Error('MODE=prod requires PROD_TOKEN env (generate from jobflow.aureonforge.com/settings)')
}

function swapConfigFor(mode) {
  const orig = readFileSync(CONFIG_PATH, 'utf8')
  const targetDev = mode === 'local' ? 'true' : 'false'
  const swapped = orig.replace(/const DEV = (true|false)/, `const DEV = ${targetDev}`)
  if (swapped !== orig) {
    writeFileSync(CONFIG_PATH, swapped)
    log(`config.js swapped to DEV=${targetDev} for ${mode} mode`)
  }
  return orig
}

async function main() {
  log(`=== Extension E2E — MODE=${MODE} ===`)

  const originalConfig = swapConfigFor(MODE)
  const cleanup = () => {
    writeFileSync(CONFIG_PATH, originalConfig)
    log('config.js restored')
  }

  try {
    log('launching Chrome with extension...')
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
      viewport: { width: 1280, height: 800 },
    })

    // 1. Wait for extension service worker (MV3)
    log('waiting for extension service worker...')
    let sws = context.serviceWorkers()
    if (sws.length === 0) {
      // Open a page first to trigger SW startup
      const probe = await context.newPage()
      await probe.goto('about:blank')
      await probe.waitForTimeout(2000)
      sws = context.serviceWorkers()
      if (sws.length === 0) {
        sws = [await context.waitForEvent('serviceworker', { timeout: 15000 })]
      }
      await probe.close()
    }
    const sw = sws.find(w => w.url().includes('chrome-extension://'))
    if (!sw) throw new Error('extension service worker not found')
    const extId = sw.url().split('/')[2]
    log(`✅ extension loaded — id=${extId}`)

    // 2. Check LinkedIn session
    const liCookies = await context.cookies('https://www.linkedin.com')
    const hasLI = liCookies.some(c => c.name === 'li_at')
    if (!hasLI) {
      log('❌ LinkedIn session missing.')
      log('   Please LOG IN TO LINKEDIN in the Chrome window that just opened.')
      log('   Then press Ctrl+C here and rerun once logged in (cookies persist in userdata dir).')
      const loginPage = await context.newPage()
      await loginPage.goto('https://www.linkedin.com/login')
      await new Promise(() => {})  // wait forever
    }
    log(`✅ LinkedIn session OK`)

    // 3. Clear prior session state + inject fresh token
    const token = MODE === 'local' ? await makeLocalToken() : await makeProdToken()
    await sw.evaluate(async (tok) => {
      await chrome.storage.local.remove(['logs', 'activeBatchId', 'batchQueue', 'currentIndex', 'results', 'checkpoint'])
      await chrome.storage.local.set({ apiToken: tok })
    }, token)
    log(`✅ cleaned prior state + injected fresh token`)

    // 4. Open popup
    const popup = await context.newPage()
    popup.on('console', msg => {
      if (msg.type() === 'error') log(`[popup:err]`, msg.text().slice(0, 200))
    })
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`)
    await popup.waitForTimeout(800)

    // Verify token field is populated by popup's own state-load
    const tokenFieldVal = await popup.locator('#token-input').inputValue().catch(() => '')
    log(`popup token field: "${tokenFieldVal.slice(0, 20)}..." (len=${tokenFieldVal.length})`)

    // 5. Attach listener for new tabs opened by the extension (so we can watch the flow)
    const appliedTabs = []
    context.on('page', async p => {
      const url = p.url()
      if (url && url.includes('linkedin.com/jobs/')) {
        log(`🆕 extension opened tab: ${url.slice(0, 100)}`)
        appliedTabs.push(p)
      }
    })

    // 6. Click Start Auto-Apply
    log('clicking Start Auto-Apply...')
    await popup.click('#start-btn')

    // 7. Monitor activity log. Stop mode configured by env:
    //   STOP_ON_MODAL=1 → stop when form detected (no real submit; default)
    //   LET_SUBMIT=1    → let extension actually submit and record docs
    const STOP_ON_MODAL = process.env.STOP_ON_MODAL !== '0' && process.env.LET_SUBMIT !== '1'
    const MAX_APPLIED = Number(process.env.MAX_APPLIED || 1)
    const deadline = Date.now() + 480000
    let lastLog = ''
    let modalReached = false
    let errored = false
    let appliedCount = 0

    while (Date.now() < deadline && !errored) {
      const txt = await popup.locator('#logs').innerText().catch(() => '')
      if (txt !== lastLog) {
        const newLines = txt.slice(lastLog.length).trim()
        if (newLines) log(`[ext-log] ${newLines.replace(/\n/g, ' | ').slice(-300)}`)
        lastLog = txt
        const stepMatch = txt.match(/Step (\d+)\/\d+ — (\d+) fields/g) || []
        const maxFields = stepMatch
          .map(s => Number(s.match(/— (\d+) fields/)?.[1] || 0))
          .reduce((a, b) => Math.max(a, b), 0)
        modalReached = modalReached || maxFields >= 2 || /Submit application|Review your application/i.test(txt)
        if (STOP_ON_MODAL && modalReached) {
          log(`\n🎯 Modal step reached — STOP_ON_MODAL enabled, stopping.`)
          await popup.click('#stop-btn').catch(() => {})
          break
        }
        appliedCount = Number(await popup.locator('#stat-applied').innerText().catch(() => '0')) || 0
        if (appliedCount >= MAX_APPLIED) {
          log(`\n🎯 ${appliedCount} applied — stopping batch`)
          await popup.click('#stop-btn').catch(() => {})
          break
        }
        if (/No saved jobs|❌|Token tidak valid|Uncaught|LinkedIn not logged in/.test(txt)) {
          errored = true
          log('\n❌ extension reported error — see logs above')
          break
        }
      }
      await new Promise(r => setTimeout(r, 800))
    }

    // 8. Stop the batch before anything submits
    log('stopping auto-apply batch...')
    await popup.click('#stop-btn').catch(() => {})
    await popup.waitForTimeout(1500)

    // 9. Report
    const stats = {
      applied: await popup.locator('#stat-applied').innerText().catch(() => '?'),
      skipped: await popup.locator('#stat-skipped').innerText().catch(() => '?'),
      failed: await popup.locator('#stat-failed').innerText().catch(() => '?'),
    }
    const finalLogs = await popup.locator('#logs').innerText().catch(() => '')
    writeFileSync(resolve(OUT_DIR, `${MODE}-logs.txt`), finalLogs)
    await popup.screenshot({ path: resolve(OUT_DIR, `${MODE}-popup.png`) })

    log('\n=== RESULT ===')
    log(`MODE: ${MODE}`)
    log(`modal_reached: ${modalReached}`)
    log(`errored: ${errored}`)
    log(`stats: applied=${stats.applied}, skipped=${stats.skipped}, failed=${stats.failed}`)
    log(`applied tabs opened: ${appliedTabs.length}`)
    log(`full log saved: ${OUT_DIR}/${MODE}-logs.txt`)

    if (modalReached && !errored) {
      log('\n✅ EXTENSION E2E PASSED — service worker + agent.js + API integration working')
    } else {
      log('\n⚠️ EXTENSION E2E INCOMPLETE — see log above')
    }

    // Leave browser open for inspection
    log('\n(leaving browser open for inspection — close manually)')
  } finally {
    cleanup()
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
