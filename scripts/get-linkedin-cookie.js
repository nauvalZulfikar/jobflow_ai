/**
 * Run this on your LOCAL machine (not the server):
 *   npx playwright@latest chromium get-linkedin-cookie.js
 *
 * Or if you have Node + playwright installed:
 *   node get-linkedin-cookie.js
 */

const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  console.log('Opening LinkedIn...')
  await page.goto('https://www.linkedin.com/login')

  console.log('\n>> Login ke LinkedIn di browser yang terbuka.')
  console.log('>> Setelah login berhasil, tekan ENTER di terminal ini.\n')

  await new Promise((resolve) => {
    process.stdin.once('data', resolve)
  })

  const cookies = await context.cookies('https://www.linkedin.com')
  const liAt = cookies.find((c) => c.name === 'li_at')

  if (liAt) {
    console.log('\n✅ Cookie li_at berhasil diambil:\n')
    console.log(liAt.value)
    console.log('\nPaste nilai di atas ke Pengaturan → Koneksi LinkedIn.\n')
  } else {
    console.log('\n❌ Cookie li_at tidak ditemukan. Pastikan sudah login.')
  }

  await browser.close()
  process.exit(0)
})()
