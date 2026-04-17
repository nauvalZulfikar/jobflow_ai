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
    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      // Try multiple URL patterns (JobStreet has changed URLs a few times)
      const urls = [
        `https://www.jobstreet.co.id/jobs/${encodeURIComponent(keyword).replace(/%20/g, '-')}-jobs?pg=${pageNum}`,
        `https://www.jobstreet.co.id/id/search-jobs/${encodeURIComponent(keyword)}/${encodeURIComponent(location)}?pg=${pageNum}`,
        `https://www.jobstreet.co.id/en/job-search/${encodeURIComponent(keyword)}-jobs/in-${encodeURIComponent(location)}/?pg=${pageNum}`,
      ]

      let scraped = false
      for (const url of urls) {
        logger.info({ url, page: pageNum }, 'Trying JobStreet URL')

        const page = await this.newStealthPage()
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
          await this.randomDelay(2000, 4000)

          // Try __NEXT_DATA__ (most reliable if present)
          const nextData = await page.evaluate(() => {
            const el = document.getElementById('__NEXT_DATA__')
            return el ? el.textContent : null
          })

          if (nextData) {
            const parsed = JSON.parse(nextData)
            // Try multiple possible paths in the data structure
            const jobs: any[] =
              parsed?.props?.pageProps?.jobsToDisplay ??
              parsed?.props?.pageProps?.jobs ??
              parsed?.props?.pageProps?.results ??
              parsed?.props?.pageProps?.data?.jobs ??
              []

            if (jobs.length > 0) {
              logger.info({ url, count: jobs.length }, 'Got jobs from __NEXT_DATA__')
              scraped = true
              for (const job of jobs) {
                try {
                  const externalId = String(job.id ?? job.jobId ?? job.listingId ?? '')
                  if (!externalId) continue

                  const title = job.title ?? job.jobTitle ?? job.positionTitle ?? ''
                  const company =
                    job.advertiser?.description ?? job.company?.name ??
                    job.advertiserName ?? ''

                  if (!title || !company) continue

                  const applyUrl =
                    job.applyUrl ??
                    job.detailUrl ??
                    `https://www.jobstreet.co.id/en/job/${externalId}`

                  yield {
                    externalId,
                    source: this.source,
                    title,
                    company,
                    location: job.location?.label ?? job.suburb ?? job.locationLabel ?? location,
                    description: job.teaser ?? job.jobDescription ?? job.summary ?? '',
                    requirements: null,
                    salaryMin: job.salary?.min ?? job.salaryFrom ?? null,
                    salaryMax: job.salary?.max ?? job.salaryTo ?? null,
                    currency: 'IDR',
                    isRemote: job.workArrangements?.some((w: any) =>
                      w.id?.toLowerCase().includes('remote') ||
                      w.label?.toLowerCase().includes('remote')
                    ) ?? false,
                    jobType: null,
                    applyUrl,
                    postedAt: job.listedAt ? new Date(job.listedAt) : null,
                  }
                } catch (err) {
                  logger.warn({ err }, 'Failed to parse JobStreet job from JSON')
                }
              }
              break // Successfully scraped this URL, no need to try others
            }
          }

          // DOM fallback — try to parse job cards directly
          const domJobs = await page.$$('[data-job-id], [data-automation="jobListing"], article[data-search-sol-meta]')
          if (domJobs.length > 0) {
            logger.info({ url, count: domJobs.length }, 'Got jobs from DOM')
            scraped = true
            for (const card of domJobs) {
              try {
                const externalId =
                  await card.getAttribute('data-job-id') ||
                  await card.getAttribute('data-id') || ''
                if (!externalId) continue

                const title = await card.$eval(
                  'h1, h2, h3, [data-automation="jobTitle"], [class*="jobTitle"]',
                  (el) => el.textContent?.trim() ?? ''
                ).catch(() => '')

                const company = await card.$eval(
                  '[data-automation="jobCompany"], [class*="company"], [class*="advertiser"]',
                  (el) => el.textContent?.trim() ?? ''
                ).catch(() => '')

                if (!title || !company) continue

                yield {
                  externalId,
                  source: this.source,
                  title,
                  company,
                  location,
                  description: '',
                  requirements: null,
                  salaryMin: null,
                  salaryMax: null,
                  currency: 'IDR',
                  isRemote: false,
                  jobType: null,
                  applyUrl: `https://www.jobstreet.co.id/en/job/${externalId}`,
                  postedAt: null,
                }
              } catch (err) {
                logger.warn({ err }, 'Failed to parse JobStreet DOM job')
              }
            }
            break
          }

          logger.warn({ url }, 'No job data found on this URL pattern')
        } catch (err) {
          logger.error({ err, url }, 'Failed to load JobStreet page')
        } finally {
          await page.context().close()
        }
      }

      if (!scraped) {
        logger.info({ pageNum }, 'No jobs found on any URL pattern, stopping')
        break
      }

      await this.randomDelay(3000, 6000)
    }
  }
}
