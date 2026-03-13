import cron from 'node-cron'
import { scrapeQueue } from '../queues/scrape-queue.js'
import type { ScrapeSource } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'scheduler' })

const KEYWORDS = [
  'software engineer',
  'frontend developer',
  'backend developer',
  'fullstack developer',
  'data analyst',
  'product manager',
]

const LOCATIONS = ['Jakarta', 'Bandung', 'Surabaya', 'Remote']
const SOURCES: ScrapeSource[] = ['jobstreet', 'linkedin', 'indeed']

async function enqueueAllJobs(triggeredBy: 'scheduled' | 'manual' = 'scheduled') {
  let count = 0
  for (const source of SOURCES) {
    for (const keyword of KEYWORDS) {
      for (const location of LOCATIONS) {
        await scrapeQueue.add(
          `${source}-${keyword}-${location}`,
          { source, keyword, location, pages: 3, triggeredBy },
          { delay: Math.floor(Math.random() * 30_000) } // stagger up to 30s
        )
        count++
      }
    }
  }
  logger.info({ count, triggeredBy }, 'Enqueued scrape jobs')
  return count
}

export function startScheduler() {
  // Run at 6:00 AM and 6:00 PM WIB (23:00 and 11:00 UTC)
  cron.schedule('0 23,11 * * *', async () => {
    logger.info('Running scheduled scrape')
    await enqueueAllJobs('scheduled')
  })

  logger.info('Scheduler started — runs at 06:00 and 18:00 WIB')
}

export { enqueueAllJobs }
