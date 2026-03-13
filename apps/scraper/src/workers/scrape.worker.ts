import { Worker } from 'bullmq'
import { createRedisConnection, SCRAPE_QUEUE_NAME } from '../queues/index.js'
import { JobStreetScraper } from '../scrapers/jobstreet.scraper.js'
import { LinkedInScraper } from '../scrapers/linkedin.scraper.js'
import { IndeedScraper } from '../scrapers/indeed.scraper.js'
import { upsertJob } from '../processors/job-upsert.js'
import type { ScrapeJobData, ScrapeSource } from '@jobflow/shared'
import { BaseScraper } from '../scrapers/base.scraper.js'
import pino from 'pino'

const logger = pino({ name: 'scrape-worker' })

function createScraper(source: ScrapeSource): BaseScraper {
  switch (source) {
    case 'jobstreet': return new JobStreetScraper()
    case 'linkedin': return new LinkedInScraper()
    case 'indeed': return new IndeedScraper()
    default: throw new Error(`Unknown scrape source: ${source}`)
  }
}

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>(
    SCRAPE_QUEUE_NAME,
    async (job) => {
      const { source, keyword, location, pages } = job.data
      logger.info({ source, keyword, location, pages }, 'Starting scrape job')

      const scraper = createScraper(source)
      let created = 0
      let updated = 0
      let failed = 0
      let total = 0

      await scraper.launchBrowser()

      try {
        for await (const scraped of scraper.scrape(keyword, location, pages)) {
          try {
            const result = await upsertJob(scraped)
            result.created ? created++ : updated++
          } catch (err) {
            failed++
            job.log(`Failed to upsert ${scraped.applyUrl}: ${err}`)
          }

          total++
          await job.updateProgress(Math.min(Math.round(total / (pages * 20) * 100), 99))
        }
      } finally {
        await scraper.closeBrowser()
      }

      logger.info({ source, keyword, created, updated, failed }, 'Scrape job complete')
      return { created, updated, failed }
    },
    {
      connection: createRedisConnection(),
      concurrency: Number(process.env.SCRAPER_MAX_CONCURRENCY ?? 2),
      limiter: { max: 5, duration: 60_000 },
    }
  )

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'Scrape job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Scrape job failed')
  })

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error')
  })

  return worker
}
