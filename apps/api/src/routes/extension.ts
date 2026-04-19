import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

type LogEntry = {
  batchId: string
  applicationId?: string | null
  level?: 'info' | 'warn' | 'error'
  message: string
  createdAt?: string
}

const MAX_BULK = 200
const MAX_MESSAGE_LEN = 2000

export async function extensionRoutes(app: FastifyInstance) {
  // POST /api/extension/logs — bulk insert activity log rows
  app.post('/logs', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { entries?: LogEntry[] }
      const entries = Array.isArray(body?.entries) ? body.entries : []

      if (entries.length === 0) {
        return reply.send(success({ inserted: 0 }))
      }
      if (entries.length > MAX_BULK) {
        return reply.status(400).send(failure('TOO_MANY', `Max ${MAX_BULK} entries per request`))
      }

      const rows = entries
        .filter(e => e && typeof e.batchId === 'string' && typeof e.message === 'string')
        .map(e => ({
          userId: user.id,
          batchId: e.batchId.slice(0, 64),
          applicationId: e.applicationId ?? null,
          level: e.level === 'warn' || e.level === 'error' ? e.level : 'info',
          message: e.message.slice(0, MAX_MESSAGE_LEN),
          createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
        }))

      if (rows.length === 0) {
        return reply.send(success({ inserted: 0 }))
      }

      const result = await prisma.extensionActivityLog.createMany({ data: rows })
      return reply.send(success({ inserted: result.count }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menyimpan log'))
    }
  })

  // GET /api/extension/logs?batchId=latest&limit=200
  // batchId=latest returns the most recent batch for the user
  app.get('/logs', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const q = request.query as { batchId?: string; limit?: string; applicationId?: string }
      const limit = Math.min(Number(q.limit) || 200, 1000)

      let batchId = q.batchId
      if (!batchId || batchId === 'latest') {
        const latest = await prisma.extensionActivityLog.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { batchId: true },
        })
        batchId = latest?.batchId
      }

      if (!batchId) {
        return reply.send(success({ batchId: null, entries: [] }))
      }

      const entries = await prisma.extensionActivityLog.findMany({
        where: {
          userId: user.id,
          batchId,
          ...(q.applicationId ? { applicationId: q.applicationId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      })

      return reply.send(success({ batchId, entries }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil log'))
    }
  })

  // GET /api/extension/logs/batches?limit=20 — list recent batches for user
  app.get('/logs/batches', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const q = request.query as { limit?: string }
      const limit = Math.min(Number(q.limit) || 20, 100)

      const rows = await prisma.$queryRaw<
        Array<{ batchId: string; count: bigint; startedAt: Date; lastAt: Date }>
      >`
        SELECT "batchId",
               COUNT(*)::bigint AS count,
               MIN("createdAt") AS "startedAt",
               MAX("createdAt") AS "lastAt"
        FROM "ExtensionActivityLog"
        WHERE "userId" = ${user.id}
        GROUP BY "batchId"
        ORDER BY MAX("createdAt") DESC
        LIMIT ${limit}
      `
      const batches = rows.map(r => ({
        batchId: r.batchId,
        count: Number(r.count),
        startedAt: r.startedAt,
        lastAt: r.lastAt,
      }))
      return reply.send(success({ batches }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar batch'))
    }
  })
}
