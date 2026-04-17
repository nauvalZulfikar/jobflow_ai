import { BaseScraper } from './base.scraper.js'
import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'linkedin-scraper' })
const MAX_JOBS_PER_RUN = 30

export class LinkedInScraper extends BaseScraper {
  source: ScrapeSource = 'linkedin'

  async *scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob> {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&f_TPR=r86400&sortBy=DD`

    logger.info({ url }, 'Scraping LinkedIn jobs')

    const page = await this.newStealthPage()

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      if (page.url().includes('authwall') || page.url().includes('login')) {
        logger.warn('LinkedIn auth wall detected, skipping')
        return
      }

      await this.randomDelay(2000, 3000)

      // Scroll to load more job cards
      for (let i = 0; i < pages * 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 800))
        await this.randomDelay(500, 1000)
      }

      await page.waitForSelector('.job-search-card, .base-card', { timeout: 10_000 }).catch(() => null)
      const jobCards = await page.$$('.job-search-card, .base-card')

      logger.info({ count: jobCards.length }, 'LinkedIn job cards found')

      for (const card of jobCards.slice(0, MAX_JOBS_PER_RUN)) {
        try {
          const urn = await card.getAttribute('data-entity-urn') ?? ''
          const externalId = urn.split(':').pop() ?? ''
          if (!externalId) continue

          const title = await card.evaluate((el) => {
            const selectors = ['.base-search-card__title', 'h3.base-search-card__title', 'h3', '.job-search-card__title']
            for (const s of selectors) {
              const t = el.querySelector(s)?.textContent?.trim()
              if (t) return t
            }
            return ''
          }).catch(() => '')

          const company = await card.evaluate((el) => {
            const selectors = ['.base-search-card__subtitle', 'h4.base-search-card__subtitle', 'h4', '.job-search-card__company-name']
            for (const s of selectors) {
              const t = el.querySelector(s)?.textContent?.trim()
              if (t) return t
            }
            return ''
          }).catch(() => '')

          const jobLocation = await card.evaluate((el) => {
            const selectors = ['.job-search-card__location', '.job-result-card__location', '[class*="location"]']
            for (const s of selectors) {
              const t = el.querySelector(s)?.textContent?.trim()
              if (t) return t
            }
            return ''
          }).catch(() => location)

          const postedAt = await card.evaluate((el) => {
            const time = el.querySelector('time')
            return time?.getAttribute('datetime') ?? null
          }).catch(() => null)

          if (!title || !company) continue

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
            applyUrl: `https://www.linkedin.com/jobs/view/${externalId}`,
            postedAt: postedAt ? new Date(postedAt) : null,
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to parse LinkedIn card')
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'LinkedIn scrape failed')
    } finally {
      await page.context().close()
    }
  }
}
