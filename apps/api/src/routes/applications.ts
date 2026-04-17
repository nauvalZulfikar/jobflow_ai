import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { CreateApplicationSchema, UpdateApplicationStatusSchema } from '@jobflow/shared'
import { success, failure } from '@jobflow/shared'
import { FOLLOW_UP_DEFAULT_DAYS } from '@jobflow/shared'

export async function applicationRoutes(app: FastifyInstance) {
  // GET /api/applications — list all applications (kanban data)
  app.get('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const applications = await prisma.jobApplication.findMany({
        where: { userId: user.id },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              location: true,
              isRemote: true,
              closingDate: true,
              applyUrl: true,
              source: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
      return reply.send(success(applications))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil daftar lamaran'))
    }
  })

  // POST /api/applications — create new application (save job)
  app.post('/', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = CreateApplicationSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const job = await prisma.job.findUnique({ where: { id: parsed.data.jobId } })
      if (!job) return reply.status(404).send(failure('NOT_FOUND', 'Lowongan tidak ditemukan'))

      const followUpDate = new Date()
      followUpDate.setDate(followUpDate.getDate() + FOLLOW_UP_DEFAULT_DAYS)

      const application = await prisma.jobApplication.create({
        data: {
          userId: user.id,
          jobId: parsed.data.jobId,
          resumeId: parsed.data.resumeId,
          coverLetterId: parsed.data.coverLetterId,
          status: 'saved',
          followUpDate,
        },
        include: { job: true },
      })

      await prisma.applicationLog.create({
        data: {
          applicationId: application.id,
          action: 'status_changed',
          detail: 'Lamaran disimpan',
        },
      })

      return reply.status(201).send(success(application))
    } catch (err) {
      // Handle unique constraint (already applied)
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send(failure('CONFLICT', 'Kamu sudah menyimpan lowongan ini'))
      }
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menyimpan lamaran'))
    }
  })

  // PATCH /api/applications/:id/status — update status
  app.patch<{ Params: { id: string } }>('/:id/status', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const parsed = UpdateApplicationStatusSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send(failure('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Data tidak valid'))
      }

      const existing = await prisma.jobApplication.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!existing) return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))

      const updated = await prisma.jobApplication.update({
        where: { id: request.params.id },
        data: {
          status: parsed.data.status,
          ...(parsed.data.status === 'applied' ? { appliedAt: new Date() } : {}),
          ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        },
      })

      await prisma.applicationLog.create({
        data: {
          applicationId: updated.id,
          action: 'status_changed',
          detail: `Status diubah dari ${existing.status} ke ${parsed.data.status}`,
        },
      })

      return reply.send(success(updated))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memperbarui status lamaran'))
    }
  })

  // GET /api/applications/:id/logs — get activity log
  app.get<{ Params: { id: string } }>('/:id/logs', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const application = await prisma.jobApplication.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!application) return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))

      const logs = await prisma.applicationLog.findMany({
        where: { applicationId: request.params.id },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(success(logs))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil log lamaran'))
    }
  })

  // POST /api/applications/:id/logs — add note/log
  app.post<{ Params: { id: string } }>('/:id/logs', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const application = await prisma.jobApplication.findFirst({
        where: { id: request.params.id, userId: user.id },
      })
      if (!application) return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))

      const { note } = request.body as { note?: string }
      if (!note?.trim()) return reply.status(400).send(failure('VALIDATION_ERROR', 'Note tidak boleh kosong'))

      const log = await prisma.applicationLog.create({
        data: {
          applicationId: request.params.id,
          action: 'note_added',
          detail: note.trim(),
        },
      })

      return reply.status(201).send(success(log))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal menambah catatan'))
    }
  })

  // POST /api/applications/batch — batch apply
  app.post('/batch', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const body = request.body as { jobIds: string[]; resumeId?: string }

      if (!Array.isArray(body.jobIds) || body.jobIds.length === 0) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'jobIds wajib diisi'))
      }

      if (body.jobIds.length > 20) {
        return reply.status(400).send(failure('VALIDATION_ERROR', 'Maksimal 20 lamaran sekaligus'))
      }

      // TODO: Queue with BullMQ — for now, create applications in 'saved' status
      const results = await Promise.allSettled(
        body.jobIds.map((jobId) =>
          prisma.jobApplication.upsert({
            where: { userId_jobId: { userId: user.id, jobId } },
            create: { userId: user.id, jobId, resumeId: body.resumeId, status: 'saved' },
            update: {},
          })
        )
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      return reply.send(success({ queued: succeeded, failed }))
    } catch {
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memproses batch lamaran'))
    }
  })
}
