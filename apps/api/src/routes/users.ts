import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function userRoutes(app: FastifyInstance) {
  // POST /api/users/me/extension-token — generate long-lived JWT for Chrome extension
  app.post('/me/extension-token', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const token = app.jwt.sign({ id: user.id }, { expiresIn: '30d' })
      return reply.send(success({ token }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat token'))
    }
  })

  // GET /api/users/me
  app.get('/me', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const found = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          plan: true,
          planExpiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      if (!found) return reply.status(404).send(failure('NOT_FOUND', 'User tidak ditemukan'))
      return reply.send(success(found))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil data user'))
    }
  })

  // PATCH /api/users/me
  app.patch('/me', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{
        name: string
        autoApplyEnabled: boolean
        autoApplyResumeId: string | null
        autoApplyMaxDaily: number
      }>

      const existing = await prisma.user.findUnique({ where: { id: user.id } })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'User tidak ditemukan'))

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.autoApplyEnabled !== undefined ? { autoApplyEnabled: body.autoApplyEnabled } : {}),
          ...(body.autoApplyResumeId !== undefined ? { autoApplyResumeId: body.autoApplyResumeId } : {}),
          ...(body.autoApplyMaxDaily !== undefined ? { autoApplyMaxDaily: body.autoApplyMaxDaily } : {}),
        },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          plan: true,
          autoApplyEnabled: true,
          autoApplyResumeId: true,
          autoApplyMaxDaily: true,
          autoApplyLastRunAt: true,
          planExpiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui data user'))
    }
  })

  // PUT /api/users/me/linkedin-cookie
  app.put('/me/linkedin-cookie', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { cookie: string }
      if (!body.cookie) return reply.status(400).send(failure('BAD_REQUEST', 'Cookie wajib diisi'))

      await prisma.userIntegration.upsert({
        where: { userId_provider: { userId: user.id, provider: 'linkedin' } },
        create: { userId: user.id, provider: 'linkedin', accessToken: body.cookie },
        update: { accessToken: body.cookie },
      })
      return reply.send(success({ ok: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menyimpan cookie LinkedIn'))
    }
  })

  // DELETE /api/users/me/linkedin-cookie
  app.delete('/me/linkedin-cookie', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      await prisma.userIntegration.deleteMany({
        where: { userId: user.id, provider: 'linkedin' },
      })
      return reply.send(success({ ok: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus cookie LinkedIn'))
    }
  })

  // GET /api/users/me/auto-apply-settings
  app.get('/me/auto-apply-settings', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const found = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          autoApplyEnabled: true,
          autoApplyResumeId: true,
          autoApplyMaxDaily: true,
          autoApplyLastRunAt: true,
        },
      })
      if (!found) return reply.status(404).send(failure('NOT_FOUND', 'User tidak ditemukan'))
      return reply.send(success(found))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil pengaturan'))
    }
  })
}
