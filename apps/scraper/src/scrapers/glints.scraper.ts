import { BaseScraper } from './base.scraper.js'
import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'glints-scraper' })

export class GlintsScraper extends BaseScraper {
  source: ScrapeSource = 'glints'

  // Glints has a public search API — no browser needed, use Node fetch
  async *scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob> {
    for (let pageNum = 0; pageNum < pages; pageNum++) {
      const offset = pageNum * 20

      try {
        const params = new URLSearchParams({
          query: keyword,
          countryCode: 'ID',
          locationName: location,
          limit: '20',
          offset: String(offset),
          sort: 'UPDATED_AT',
        })

        const res = await fetch(`https://glints.com/api/jobs/search?${params}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          logger.warn({ status: res.status, keyword, pageNum }, 'Glints API returned error')
          break
        }

        const data = await res.json() as any
        const jobs: any[] = data?.data ?? data?.jobs ?? data?.results ?? []

        if (jobs.length === 0) {
          logger.info({ keyword, pageNum }, 'No Glints jobs found')
          break
        }

        logger.info({ count: jobs.length, keyword, pageNum }, 'Got Glints jobs')

        for (const job of jobs) {
          try {
            const externalId = String(job.id ?? job.jobId ?? '')
            if (!externalId) continue

            const title = job.title ?? job.name ?? ''
            const company = job.company?.name ?? job.advertiserName ?? ''
            if (!title || !company) continue

            yield {
              externalId,
              source: this.source,
              title,
              company,
              location: job.city?.name ?? job.location?.name ?? location,
              description: job.description ?? job.summary ?? job.teaser ?? '',
              requirements: null,
              salaryMin: job.minSalary ?? job.salaryFrom ?? null,
              salaryMax: job.maxSalary ?? job.salaryTo ?? null,
              currency: 'IDR',
              isRemote: job.isRemote ?? false,
              jobType: job.isRemote ? 'remote' : null,
              applyUrl: `https://glints.com/id/opportunities/jobs/${externalId}`,
              postedAt: job.updatedAt ? new Date(job.updatedAt) : null,
            }
          } catch (err) {
            logger.warn({ err }, 'Failed to parse Glints job')
          }
        }
      } catch (err) {
        logger.error({ err, keyword, pageNum }, 'Glints request failed')
        break
      }

      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // Glints doesn't need browser
  async launchBrowser(): Promise<void> {}
  async closeBrowser(): Promise<void> {}
}
