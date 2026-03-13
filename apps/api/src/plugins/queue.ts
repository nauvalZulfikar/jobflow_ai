import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import type { ScrapeJobData } from '@jobflow/shared'

const redis = new IORedis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
})

export const scrapeQueue = new Queue<ScrapeJobData>('scrape-jobs', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})
