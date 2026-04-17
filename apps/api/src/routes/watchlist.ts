import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function watchlistRoutes(app: FastifyInstance) {
  // GET /api/watchlist
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const watchlist = await prisma.companyWatchlist.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(success(watchlist))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil watchlist'))
    }
  })

  // POST /api/watchlist
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { companyName?: string; careerUrl?: string }

      if (!body.companyName || typeof body.companyName !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'companyName wajib diisi'))
      }

      const item = await prisma.companyWatchlist.create({
        data: {
          userId: user.id,
          companyName: body.companyName,
          ...(body.careerUrl !== undefined ? { careerUrl: body.careerUrl } : {}),
        },
      })
      return reply.status(201).send(success(item))
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send(failure('CONFLICT', 'Perusahaan ini sudah ada di watchlist'))
      }
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menambah watchlist'))
    }
  })

  // DELETE /api/watchlist/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.companyWatchlist.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Item watchlist tidak ditemukan'))

      await prisma.companyWatchlist.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus watchlist'))
    }
  })
}
