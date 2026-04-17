import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { success, failure } from '@jobflow/shared'

export async function interviewRoutes(app: FastifyInstance) {
  // GET /api/interviews
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const query = request.query as { applicationId?: string }

      const interviews = await prisma.interview.findMany({
        where: {
          application: {
            userId: user.id,
            ...(query.applicationId ? { id: query.applicationId } : {}),
          },
        },
        include: {
          application: {
            include: {
              job: {
                select: { id: true, title: true, company: true },
              },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
      })
      return reply.send(success(interviews))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar interview'))
    }
  })

  // POST /api/interviews
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as {
        applicationId?: string
        scheduledAt?: string
        type?: string
        notes?: string
      }

      if (!body.applicationId || typeof body.applicationId !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'applicationId wajib diisi'))
      }
      if (!body.scheduledAt) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'scheduledAt wajib diisi'))
      }
      if (!body.type || typeof body.type !== 'string') {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'type wajib diisi'))
      }

      const application = await prisma.jobApplication.findFirst({
        where: { id: body.applicationId, userId: user.id },
      })
      if (!application) {
        return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))
      }

      const interview = await prisma.interview.create({
        data: {
          applicationId: body.applicationId,
          scheduledAt: new Date(body.scheduledAt),
          type: body.type,
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      })

      await prisma.applicationLog.create({
        data: {
          applicationId: body.applicationId,
          action: 'interview_scheduled',
          detail: `Interview dijadwalkan pada ${new Date(body.scheduledAt).toLocaleDateString('id-ID')}`,
        },
      })

      return reply.status(201).send(success(interview))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membuat interview'))
    }
  })

  // PATCH /api/interviews/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as Partial<{ outcome: string; notes: string; scheduledAt: string }>

      const existing = await prisma.interview.findFirst({
        where: {
          id: request.params.id,
          application: { userId: user.id },
        },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Interview tidak ditemukan'))

      const updated = await prisma.interview.update({
        where: { id: request.params.id },
        data: {
          ...(body.outcome !== undefined ? { outcome: body.outcome } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.scheduledAt !== undefined ? { scheduledAt: new Date(body.scheduledAt) } : {}),
        },
      })
      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui interview'))
    }
  })

  // DELETE /api/interviews/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const existing = await prisma.interview.findFirst({
        where: {
          id: request.params.id,
          application: { userId: user.id },
        },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Interview tidak ditemukan'))

      await prisma.interview.delete({ where: { id: request.params.id } })
      return reply.send(success({ deleted: true }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menghapus interview'))
    }
  })
}
