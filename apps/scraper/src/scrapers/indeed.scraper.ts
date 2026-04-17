import { BaseScraper } from './base.scraper.js'
import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'indeed-scraper' })

export class IndeedScraper extends BaseScraper {
  source: ScrapeSource = 'indeed'

  async *scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob> {
    for (let pageNum = 0; pageNum < pages; pageNum++) {
      const start = pageNum * 10
      const url = `https://id.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}&sort=date&start=${start}`

      logger.info({ url, page: pageNum + 1 }, 'Scraping Indeed page')

      const page = await this.newStealthPage()
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await this.randomDelay(2000, 4000)

        // Check for CAPTCHA / block
        const currentUrl = page.url()
        if (
          currentUrl.includes('excuse') ||
          currentUrl.includes('security') ||
          (await page.$('.g-recaptcha').catch(() => null)) !== null
        ) {
          logger.warn('Indeed CAPTCHA/block detected, skipping')
          return
        }

        // Try to extract job data from embedded JSON first (more reliable than CSS selectors)
        const jsonJobs = await page.evaluate(() => {
          try {
            // Indeed embeds job data in a script tag as JSON
            const scripts = Array.from(document.querySelectorAll('script'))
            for (const s of scripts) {
              const text = s.textContent ?? ''
              if (text.includes('"jobKey"') || text.includes('"jobTitle"')) {
                const match = text.match(/window\._initialData\s*=\s*(\{.+?\});/s) ||
                              text.match(/window\.__REDUX_STATE__\s*=\s*(\{.+?\});/s)
                if (match) {
                  try { return JSON.parse(match[1]) } catch { continue }
                }
              }
            }
          } catch { }
          return null
        })

        // Fallback to DOM scraping
        await page.waitForSelector('[data-jk], .job_seen_beacon, .tapItem', { timeout: 10_000 }).catch(() => null)
        const jobCards = await page.$$('[data-jk], .job_seen_beacon')

        if (jobCards.length === 0) {
          logger.info({ pageNum }, 'No Indeed jobs found on page')
          break
        }

        for (const card of jobCards) {
          try {
            // Get job key from multiple possible attributes
            const externalId =
              await card.getAttribute('data-jk') ||
              await card.getAttribute('data-jobkey') ||
              ''
            if (!externalId) continue

            // Try multiple title selectors (Indeed changes these frequently)
            const title = await card.evaluate((el) => {
              const selectors = [
                'h2.jobTitle a span[title]',
                'h2.jobTitle span',
                '[data-testid="jobsearch-JobInfoHeader-title"]',
                '.jobTitle span',
                'h2 a span',
                'h2 span',
              ]
              for (const sel of selectors) {
                const found = el.querySelector(sel)
                const text = found?.getAttribute('title') || found?.textContent?.trim()
                if (text) return text
              }
              return el.querySelector('h2')?.textContent?.trim() ?? ''
            }).catch(() => '')

            // Try multiple company selectors
            const company = await card.evaluate((el) => {
              const selectors = [
                '[data-testid="company-name"]',
                '.companyName',
                '.css-1h7lukg',
                'span.companyName',
                '[class*="companyName"]',
              ]
              for (const sel of selectors) {
                const found = el.querySelector(sel)
                const text = found?.textContent?.trim()
                if (text) return text
              }
              return ''
            }).catch(() => '')

            // Location
            const jobLocation = await card.evaluate((el) => {
              const selectors = [
                '[data-testid="text-location"]',
                '.companyLocation',
                '[class*="companyLocation"]',
              ]
              for (const sel of selectors) {
                const found = el.querySelector(sel)
                const text = found?.textContent?.trim()
                if (text) return text
              }
              return ''
            }).catch(() => location)

            if (!title || !company) {
              logger.debug({ externalId }, 'Skipping job with empty title/company')
              continue
            }

            const applyUrl = `https://id.indeed.com/viewjob?jk=${externalId}`

            yield {
              externalId,
              source: this.source,
              title,
              company,
              location: jobLocation || location,
              description: '',
              requirements: null,
              salaryMin: null,
              salaryMax: null,
              currency: 'IDR',
              isRemote: (jobLocation || location).toLowerCase().includes('remote'),
              jobType: null,
              applyUrl,
              postedAt: null,
            }
          } catch (err) {
            logger.warn({ err }, 'Failed to parse Indeed job card')
          }
        }
      } catch (err) {
        logger.error({ err, url }, 'Failed to scrape Indeed page')
      } finally {
        await page.context().close()
      }

      await this.randomDelay(3000, 6000)
    }
  }
}
