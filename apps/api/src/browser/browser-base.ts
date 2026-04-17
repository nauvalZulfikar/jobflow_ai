import { chromium, Browser, Page } from 'playwright'

export class BrowserBase {
  protected browser: Browser | null = null

  async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    })
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  protected async newStealthPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not launched')

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'id-ID',
      extraHTTPHeaders: {
        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      viewport: { width: 1366, height: 768 },
      geolocation: { latitude: -6.2088, longitude: 106.8456 },
      permissions: ['geolocation'],
    })

    const page = await context.newPage()

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] })
      // @ts-ignore
      window.chrome = { runtime: {} }
    })

    return page
  }

  protected randomDelay(min = 2000, max = 5000): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  protected slugify(text: string): string {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }
}
