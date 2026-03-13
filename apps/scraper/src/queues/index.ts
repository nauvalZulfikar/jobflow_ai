import IORedis from 'ioredis'

export const SCRAPE_QUEUE_NAME = 'scrape-jobs'

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  })
}
