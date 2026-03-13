import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { JobFilterSchema, ScrapeRequestSchema } from '@jobflow/shared'
import { success, failure } from '@jobflow/shared'
import { scrapeQueue } from '../plugins/queue.js'

export async function jobRoutes(app: FastifyInstance) {
  // GET /api/jobs — list jobs with filters
  app.get('/', async (request, reply) => {
    try {
      const parsed = JobFilterSchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send(
          failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Filter tidak valid')
        )
      }

      const { title, company, location, salaryMin, salaryMax, isRemote, source, industry, page, limit } = parsed.data

      const where = {
        ...(title ? { title: { contains: title, mode: 'insensitive' as const } } : {}),
        ...(company ? { company: { contains: company, mode: 'insensitive' as const } } : {}),
        ...(location ? { location: { contains: location, mode: 'insensitive' as const } } : {}),
        ...(isRemote !== undefined ? { isRemote } : {}),
        ...(source ? { source } : {}),
        ...(industry ? { industry } : {}),
        ...(salaryMin ? { salaryMin: { gte: salaryMin } } : {}),
        ...(salaryMax ? { salaryMax: { lte: salaryMax } } : {}),
        duplicateOf: null,
      }

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: { postedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.job.count({ where }),
      ])

      return reply.send(
        success({
          jobs,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        })
      )
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar lowongan'))
    }
  })

  // GET /api/jobs/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const job = await prisma.job.findUnique({ where: { id: request.params.id } })
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))
      return reply.send(success(job))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil detail lowongan'))
    }
  })

  // POST /api/jobs/sync — trigger manual scraping
  app.post('/sync', async (request, reply) => {
    try {
      const parsed = ScrapeRequestSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(
          failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Request tidak valid')
        )
      }

      const { sources, keywords, location, pages } = parsed.data
      const jobIds: string[] = []

      for (const source of sources) {
        for (const keyword of keywords) {
          const job = await scrapeQueue.add(
            `${source}-${keyword}-${location}`,
            { source, keyword, location, pages, triggeredBy: 'manual' },
            { delay: Math.floor(Math.random() * 5000) }
          )
          if (job.id) jobIds.push(job.id)
        }
      }

      return reply.send(
        success({
          queuedCount: jobIds.length,
          jobIds,
          estimatedTime: `${jobIds.length * 5}-${jobIds.length * 10} menit`,
        })
      )
    } catch (err) {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memulai sinkronisasi'))
    }
  })

  // GET /api/jobs/sync/status — queue status
  app.get('/sync/status', async (_request, reply) => {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        scrapeQueue.getWaitingCount(),
        scrapeQueue.getActiveCount(),
        scrapeQueue.getCompletedCount(),
        scrapeQueue.getFailedCount(),
      ])
      return reply.send(success({ waiting, active, completed, failed }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil status queue'))
    }
  })

  // POST /api/jobs/deduplicate — run deduplication
  app.post('/deduplicate', async (_request, reply) => {
    try {
      const jobs = await prisma.job.findMany({
        where: { duplicateOf: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, company: true, title: true, location: true },
      })

      const seen = new Map<string, string>()
      let duplicatesMarked = 0

      for (const job of jobs) {
        const key = `${job.company.toLowerCase()}|${job.title.toLowerCase()}|${(job.location ?? '').toLowerCase()}`
        if (seen.has(key)) {
          await prisma.job.update({
            where: { id: job.id },
            data: { duplicateOf: seen.get(key) },
          })
          duplicatesMarked++
        } else {
          seen.set(key, job.id)
        }
      }

      return reply.send(success({ duplicatesMarked }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menjalankan deduplikasi'))
    }
  })
}
