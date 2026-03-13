import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { CreateCoverLetterSchema } from '@jobflow/shared'
import { success, failure } from '@jobflow/shared'

export async function coverLetterRoutes(app: FastifyInstance) {
  // GET /api/cover-letters
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const templates = await prisma.coverLetterTemplate.findMany({
        where: { userId: user.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      })
      return reply.send(success(templates))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil template'))
    }
  })

  // GET /api/cover-letters/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const tmpl = await prisma.coverLetterTemplate.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!tmpl) return reply.status(404).send(failure('NOT_FOUND', 'Template tidak ditemukan'))
      return reply.send(success(tmpl))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil template'))
    }
  })

  // POST /api/cover-letters
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = CreateCoverLetterSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      if (parsed.data.isDefault) {
        await prisma.coverLetterTemplate.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        })
      }

      const tmpl = await prisma.coverLetterTemplate.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { userId: user.id, ...parsed.data } as any,
      })
      return reply.status(201).send(success(tmpl))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat template'))
    }
  })

  // PATCH /api/cover-letters/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.coverLetterTemplate.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Template tidak ditemukan'))

      const body = request.body as Partial<{ title: string; body: string; isDefault: boolean }>

      if (body.isDefault === true) {
        await prisma.coverLetterTemplate.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        })
      }

      const updated = await prisma.coverLetterTemplate.update({
        where: { id: request.params.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui template'))
    }
  })

  // DELETE /api/cover-letters/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.coverLetterTemplate.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Template tidak ditemukan'))

      await prisma.coverLetterTemplate.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus template'))
    }
  })
}
