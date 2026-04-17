import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function savedSearchRoutes(app: FastifyInstance) {
  // GET /api/saved-searches
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const searches = await prisma.savedSearch.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(success(searches))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil pencarian tersimpan'))
    }
  })

  // POST /api/saved-searches
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as {
        name?: string
        filters?: Record<string, unknown>
        notifyEmail?: boolean
        frequency?: string
      }

      if (!body.name || typeof body.name !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'name wajib diisi'))
      }
      if (!body.filters || typeof body.filters !== 'object') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'filters wajib berupa object'))
      }

      const search = await prisma.savedSearch.create({
        data: {
          userId: user.id,
          name: body.name,
          filters: (body.filters ?? {}) as Record<string, string>,
          notifyEmail: body.notifyEmail ?? true,
          frequency: body.frequency ?? 'realtime',
        },
      })
      return reply.status(201).send(success(search))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menyimpan pencarian'))
    }
  })

  // PATCH /api/saved-searches/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{ notifyEmail: boolean; frequency: string }>

      const existing = await prisma.savedSearch.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Pencarian tidak ditemukan'))

      const updated = await prisma.savedSearch.update({
        where: { id: request.params.id },
        data: {
          ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}),
          ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui pencarian'))
    }
  })

  // DELETE /api/saved-searches/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.savedSearch.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Pencarian tidak ditemukan'))

      await prisma.savedSearch.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus pencarian'))
    }
  })
}
