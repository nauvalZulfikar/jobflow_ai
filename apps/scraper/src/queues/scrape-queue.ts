import { Queue } from 'bullmq'
import { createRedisConnection, SCRAPE_QUEUE_NAME } from './index.js'
import type { ScrapeJobData } from '@jobflow/shared'

export const scrapeQueue = new Queue<ScrapeJobData>(SCRAPE_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})
