import cron from 'node-cron'
import { scrapeQueue } from '../queues/scrape-queue.js'
import type { ScrapeSource } from '@jobflow/shared'
import { runAutoApplyPipeline } from '../workers/auto-apply-pipeline.worker.js'
import pino from 'pino'

const logger = pino({ name: 'scheduler' })

const KEYWORDS = [
  'data analyst',
  'data scientist',
  'data engineer',
  'business analyst',
  'business intelligence',
  'data analytics',
  'machine learning engineer',
  'AI analyst',
]

const LOCATIONS = ['Jakarta', 'Bandung', 'Surabaya', 'Remote']

// LinkedIn works without blocking; Indeed & JobStreet & Glints are blocked/firewalled
const ACTIVE_SOURCES: ScrapeSource[] = ['linkedin']

async function enqueueAllJobs(triggeredBy: 'scheduled' | 'manual' = 'scheduled') {
  let count = 0
  for (const source of ACTIVE_SOURCES) {
    for (const keyword of KEYWORDS) {
      for (const location of LOCATIONS) {
        await scrapeQueue.add(
          `${source}-${keyword}-${location}`,
          { source, keyword, location, pages: 3, triggeredBy },
          { delay: Math.floor(Math.random() * 30_000) }
        )
        count++
      }
    }
  }
  logger.info({ count, triggeredBy }, 'Enqueued scrape jobs')
  return count
}

export function startScheduler() {
  // Scrape at 06:00 and 18:00 WIB (23:00 and 11:00 UTC)
  cron.schedule('0 23,11 * * *', async () => {
    logger.info('Running scheduled scrape')
    await enqueueAllJobs('scheduled')
  })

  // Auto-apply pipeline: 30 min after scrape — 06:30 & 18:30 WIB
  cron.schedule('30 23,11 * * *', async () => {
    logger.info('Running scheduled auto-apply pipeline')
    await runAutoApplyPipeline()
  })

  logger.info('Scheduler started — scrape at 06:00 & 18:00 WIB (LinkedIn + Glints)')
}

export { enqueueAllJobs }
