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
import { authMiddleware } from './middleware/auth.js'

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

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await app.listen({ port: PORT, host: HOST })
  console.log(`🚀 API server running at http://localhost:${PORT}`)
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
