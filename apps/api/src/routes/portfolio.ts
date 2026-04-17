import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function portfolioRoutes(app: FastifyInstance) {
  // GET /api/portfolio
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const items = await prisma.portfolioItem.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(success(items))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil portfolio'))
    }
  })

  // POST /api/portfolio
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { title?: string; url?: string; categories?: string[] }

      if (!body.title || typeof body.title !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'title wajib diisi'))
      }

      const item = await prisma.portfolioItem.create({
        data: {
          userId: user.id,
          title: body.title,
          ...(body.url !== undefined ? { url: body.url } : {}),
          categories: Array.isArray(body.categories) ? body.categories : [],
        },
      })
      return reply.status(201).send(success(item))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menambah portfolio'))
    }
  })

  // PATCH /api/portfolio/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{ title: string; url: string; categories: string[] }>

      const existing = await prisma.portfolioItem.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Item portfolio tidak ditemukan'))

      const updated = await prisma.portfolioItem.update({
        where: { id: request.params.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.categories !== undefined ? { categories: body.categories } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui portfolio'))
    }
  })

  // DELETE /api/portfolio/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.portfolioItem.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Item portfolio tidak ditemukan'))

      await prisma.portfolioItem.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus portfolio'))
    }
  })
}
