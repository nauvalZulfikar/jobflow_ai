import { BaseScraper } from './base.scraper.js'
import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'jobstreet-scraper' })

export class JobStreetScraper extends BaseScraper {
  source: ScrapeSource = 'jobstreet'

  async *scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob> {
    const encodedKeyword = encodeURIComponent(keyword)
    const encodedLocation = encodeURIComponent(location)

    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const url = `https://www.jobstreet.co.id/en/job-search/${encodedKeyword}-jobs/in-${encodedLocation}/?pg=${pageNum}`
      logger.info({ url, page: pageNum }, 'Scraping JobStreet page')

      const page = await this.newStealthPage()
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await this.randomDelay(2000, 4000)

        // JobStreet embeds data in __NEXT_DATA__
        const nextData = await page.evaluate(() => {
          const el = document.getElementById('__NEXT_DATA__')
          return el ? el.textContent : null
        })

        if (!nextData) {
          logger.warn({ url }, 'No __NEXT_DATA__ found on page')
          continue
        }

        const parsed = JSON.parse(nextData)
        const jobs: any[] =
          parsed?.props?.pageProps?.jobsToDisplay ??
          parsed?.props?.pageProps?.jobs ??
          []

        if (jobs.length === 0) {
          logger.info({ pageNum }, 'No jobs found, stopping pagination')
          break
        }

        for (const job of jobs) {
          try {
            const externalId = String(job.id ?? job.jobId ?? '')
            if (!externalId) continue

            const applyUrl =
              job.applyUrl ??
              `https://www.jobstreet.co.id/en/job/${externalId}`

            yield {
              externalId,
              source: this.source,
              title: job.title ?? job.jobTitle ?? '',
              company: job.advertiser?.description ?? job.company?.name ?? '',
              location: job.location?.label ?? job.suburb ?? location,
              description: job.teaser ?? job.jobDescription ?? '',
              requirements: null,
              salaryMin: job.salary?.min ?? null,
              salaryMax: job.salary?.max ?? null,
              currency: 'IDR',
              isRemote: job.workArrangements?.some((w: any) =>
                w.id?.toLowerCase().includes('remote')
              ) ?? false,
              jobType: job.workTypes?.[0]?.label?.toLowerCase().includes('remote')
                ? 'remote'
                : null,
              applyUrl,
              postedAt: job.listedAt ? new Date(job.listedAt) : null,
            }
          } catch (err) {
            logger.error({ err, job }, 'Failed to parse job listing')
          }
        }
      } catch (err) {
        logger.error({ err, url }, 'Failed to scrape JobStreet page')
      } finally {
        await page.context().close()
      }

      await this.randomDelay(3000, 6000)
    }
  }
}
