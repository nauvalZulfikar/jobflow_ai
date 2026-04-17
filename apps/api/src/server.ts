import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'

import { resumeRoutes } from './routes/resume.js'
import { jobRoutes } from './routes/jobs.js'
import { aiRoutes } from './routes/ai.js'
import { applicationRoutes } from './routes/applications.js'
import { storageRoutes } from './routes/storage.js'
import { skillRoutes } from './routes/skills.js'
import { coverLetterRoutes } from './routes/cover-letters.js'
import { userRoutes } from './routes/users.js'
import { savedSearchRoutes } from './routes/saved-searches.js'
import { watchlistRoutes } from './routes/watchlist.js'
import { portfolioRoutes } from './routes/portfolio.js'
import { notificationRoutes } from './routes/notifications.js'
import { interviewRoutes } from './routes/interviews.js'
import { starStoryRoutes } from './routes/star-stories.js'
import { billingRoutes } from './routes/billing.js'
import { teamRoutes } from './routes/teams.js'
import { autoApplyRoutes } from './routes/auto-apply.js'
import { authMiddleware } from './middleware/auth.js'
import { processFollowUpReminders } from './cron/follow-up.js'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function bootstrap() {
  // Plugins
  await app.register(cors, {
    origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  await app.register(jwt, {
    secret: process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production',
  })

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  })

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  })

  // Auth middleware
  app.addHook('onRequest', authMiddleware)

  // Routes
  await app.register(resumeRoutes, { prefix: '/api/resume' })
  await app.register(jobRoutes, { prefix: '/api/jobs' })
  await app.register(aiRoutes, { prefix: '/api/ai' })
  await app.register(applicationRoutes, { prefix: '/api/applications' })
  await app.register(storageRoutes, { prefix: '/api/storage' })
  await app.register(skillRoutes, { prefix: '/api/skills' })
  await app.register(coverLetterRoutes, { prefix: '/api/cover-letters' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(savedSearchRoutes, { prefix: '/api/saved-searches' })
  await app.register(watchlistRoutes, { prefix: '/api/watchlist' })
  await app.register(portfolioRoutes, { prefix: '/api/portfolio' })
  await app.register(notificationRoutes, { prefix: '/api/notifications' })
  await app.register(interviewRoutes, { prefix: '/api/interviews' })
  await app.register(starStoryRoutes, { prefix: '/api/star-stories' })
  await app.register(billingRoutes, { prefix: '/api/billing' })
  await app.register(teamRoutes, { prefix: '/api/teams' })
  await app.register(autoApplyRoutes, { prefix: '/api/applications' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await app.listen({ port: PORT, host: HOST })
  console.log(`🚀 API server running at http://localhost:${PORT}`)

  // Cron: process follow-up reminders every hour
  setInterval(processFollowUpReminders, 60 * 60 * 1000)
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
