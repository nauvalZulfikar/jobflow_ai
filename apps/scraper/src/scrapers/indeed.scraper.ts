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
      const encodedKeyword = encodeURIComponent(keyword)
      const encodedLocation = encodeURIComponent(location)
      const start = pageNum * 10
      const url = `https://id.indeed.com/jobs?q=${encodedKeyword}&l=${encodedLocation}&sort=date&start=${start}`

      logger.info({ url, page: pageNum + 1 }, 'Scraping Indeed page')

      const page = await this.newStealthPage()
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await this.randomDelay(2000, 4000)

        // Detect CAPTCHA
        const isCaptcha =
          page.url().includes('excuse') ||
          (await page.$('.g-recaptcha').catch(() => null)) !== null

        if (isCaptcha) {
          logger.warn('Indeed CAPTCHA detected, skipping')
          return
        }

        // Wait for job cards
        await page.waitForSelector('[data-jk]', { timeout: 10_000 }).catch(() => null)
        const jobCards = await page.$$('[data-jk]')

        if (jobCards.length === 0) {
          logger.info({ pageNum }, 'No Indeed jobs found, stopping')
          break
        }

        for (const card of jobCards) {
          try {
            const externalId = await card.getAttribute('data-jk') ?? ''
            if (!externalId) continue

            const title = await card
              .$eval('.jobTitle span, [data-testid="job-title"]', (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const company = await card
              .$eval('.companyName, [data-testid="company-name"]', (el) => el.textContent?.trim() ?? '')
              .catch(() => '')
            const jobLocation = await card
              .$eval('.companyLocation, [data-testid="text-location"]', (el) => el.textContent?.trim() ?? '')
              .catch(() => location)

            const applyUrl = `https://id.indeed.com/viewjob?jk=${externalId}`

            // Get full description
            let description = ''
            try {
              const detailPage = await this.newStealthPage()
              await detailPage.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
              await this.randomDelay(2000, 4000)
              description = await detailPage
                .$eval('#jobDescriptionText, .jobsearch-jobDescriptionText', (el) => el.textContent?.trim() ?? '')
                .catch(() => '')
              await detailPage.context().close()
            } catch {
              // description remains empty
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
          } catch (err) {
            logger.error({ err }, 'Failed to parse Indeed job card')
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
