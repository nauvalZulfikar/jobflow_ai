import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import type { AutoApplyJobData } from '@jobflow/shared'

export const AUTO_APPLY_QUEUE_NAME = 'auto-apply'

function createRedisConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  })
}

export const autoApplyQueue = new Queue<AutoApplyJobData>(AUTO_APPLY_QUEUE_NAME, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: createRedisConnection() as any,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})
