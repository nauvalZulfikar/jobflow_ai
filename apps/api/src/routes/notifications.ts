import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const notifications = await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return reply.send(success(notifications))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil notifikasi'))
    }
  })

  // GET /api/notifications/unread-count
  app.get('/unread-count', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const count = await prisma.notification.count({
        where: { userId: user.id, isRead: false },
      })
      return reply.send(success({ count }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghitung notifikasi belum dibaca'))
    }
  })

  // PATCH /api/notifications/read-all
  app.patch('/read-all', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      })
      return reply.send(success({ updated: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menandai semua notifikasi dibaca'))
    }
  })

  // PATCH /api/notifications/:id/read
  app.patch<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.notification.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Notifikasi tidak ditemukan'))

      const updated = await prisma.notification.update({
        where: { id: request.params.id },
        data: { isRead: true },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menandai notifikasi dibaca'))
    }
  })
}
