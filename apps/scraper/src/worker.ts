import 'dotenv/config'
import pino from 'pino'
import { startScrapeWorker } from './workers/scrape.worker.js'
import { startAutoApplyWorker } from './workers/auto-apply.worker.js'
import { startScheduler } from './scheduler/cron.js'

const logger = pino({
  name: 'scraper',
  transport: { target: 'pino-pretty' },
})

async function main() {
  logger.info('Starting JobFlow scraper worker')

  const scrapeWorker = startScrapeWorker()
  const autoApplyWorker = startAutoApplyWorker()
  startScheduler()

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...')
    await Promise.all([scrapeWorker.close(), autoApplyWorker.close()])
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...')
    await Promise.all([scrapeWorker.close(), autoApplyWorker.close()])
    process.exit(0)
  })

  logger.info('Scraper worker ready, waiting for jobs...')
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error starting scraper')
  process.exit(1)
})
