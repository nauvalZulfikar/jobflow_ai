import { BaseScraper } from './base.scraper.js'
import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'linkedin-scraper' })
const MAX_JOBS_PER_RUN = 25

export class LinkedInScraper extends BaseScraper {
  source: ScrapeSource = 'linkedin'

  async *scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob> {
    const encodedKeyword = encodeURIComponent(keyword)
    const encodedLocation = encodeURIComponent(location)
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodedKeyword}&location=${encodedLocation}&f_TPR=r86400&sortBy=DD`

    logger.info({ url }, 'Scraping LinkedIn jobs')

    const page = await this.newStealthPage()
    let jobCount = 0

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      // Check for auth wall
      if (page.url().includes('authwall') || page.url().includes('login')) {
        logger.warn('LinkedIn redirected to auth wall, skipping')
        return
      }

      await this.randomDelay(2000, 4000)

      // Scroll to load more jobs
      for (let i = 0; i < pages * 2; i++) {
        await page.evaluate(() => window.scrollBy(0, 800))
        await this.randomDelay(800, 1500)
      }

      const jobCards = await page.$$('.job-search-card, .base-card')
      logger.info({ count: jobCards.length }, 'Found LinkedIn job cards')

      for (const card of jobCards.slice(0, MAX_JOBS_PER_RUN)) {
        if (jobCount >= MAX_JOBS_PER_RUN) break

        try {
          const urn = await card.getAttribute('data-entity-urn') ?? ''
          const externalId = urn.split(':').pop() ?? ''
          if (!externalId) continue

          const title = await card
            .$eval('.base-search-card__title, h3', (el) => el.textContent?.trim() ?? '')
            .catch(() => '')
          const company = await card
            .$eval('.base-search-card__subtitle, h4', (el) => el.textContent?.trim() ?? '')
            .catch(() => '')
          const jobLocation = await card
            .$eval('.job-search-card__location, .job-result-card__location', (el) => el.textContent?.trim() ?? '')
            .catch(() => location)

          const applyUrl = `https://www.linkedin.com/jobs/view/${externalId}`

          // Get description from detail panel
          let description = ''
          try {
            await card.click()
            await page.waitForSelector('.description__text, .show-more-less-html', {
              timeout: 8000,
            })
            description = await page
              .$eval('.description__text, .show-more-less-html', (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            await this.randomDelay(3000, 5000)
          } catch {
            // description remains empty — acceptable
          }

          yield {
            externalId,
            source: this.source,
            title,
            company,
            location: jobLocation,
            description,
            requirements: null,
            salaryMin: null,
            salaryMax: null,
            currency: 'IDR',
            isRemote: jobLocation.toLowerCase().includes('remote'),
            jobType: jobLocation.toLowerCase().includes('remote') ? 'remote' : null,
            applyUrl,
            postedAt: null,
          }

          jobCount++
        } catch (err) {
          logger.error({ err }, 'Failed to parse LinkedIn job card')
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('429') || err?.message?.includes('rate')) {
        throw new Error('LinkedIn rate limited — will retry')
      }
      logger.error({ err }, 'LinkedIn scrape failed')
    } finally {
      await page.context().close()
    }
  }
}
