import { Queue } from 'bullmq'
import type { AutoApplyJobData } from '@jobflow/shared'
import { createRedisConnection } from './index.js'

export const AUTO_APPLY_QUEUE_NAME = 'auto-apply'

export const autoApplyQueue = new Queue<AutoApplyJobData>(AUTO_APPLY_QUEUE_NAME, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: createRedisConnection() as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})
