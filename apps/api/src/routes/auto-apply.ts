import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { generateFormAnswers } from '@jobflow/ai'
import { success, failure } from '@jobflow/shared'
import { autoApplyQueue } from '../plugins/auto-apply-queue.js'
import { IndeedApplier } from '../appliers/indeed.applier.js'
import { JobStreetApplier } from '../appliers/jobstreet.applier.js'
import { LinkedInApplier } from '../appliers/linkedin.applier.js'
import type { ResumeContent } from '@jobflow/shared'

const SUPPORTED_SOURCES = ['indeed', 'jobstreet', 'linkedin'] as const
type SupportedSource = (typeof SUPPORTED_SOURCES)[number]

export async function autoApplyRoutes(app: FastifyInstance) {
  // POST /api/applications/:id/auto-apply
  // Detect fields → AI answers → langsung enqueue (no preview)
  app.post<{ Params: { id: string } }>('/:id/auto-apply', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const { id: applicationId } = request.params

      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, userId: user.id },
        include: { job: true, resume: true },
      })
      if (!application) {
        return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))
      }
      if (!application.resume) {
        return reply.status(400).send(failure('NO_RESUME', 'Pilih resume terlebih dahulu sebelum auto-apply'))
      }

      // Idempotent: jangan ulangi jika sudah submitted
      const existing = await prisma.autoApplySession.findUnique({ where: { applicationId } })
      if (existing && ['submitting', 'submitted'].includes(existing.status)) {
        return reply.send(success({ sessionId: existing.id, status: existing.status }))
      }

      const source = application.job.source
      if (!SUPPORTED_SOURCES.includes(source as SupportedSource)) {
        return reply.status(400).send(
          failure('UNSUPPORTED_SOURCE', `Auto-apply belum mendukung platform ${source}`)
        )
      }

      // Build applier
      let applier
      if (source === 'indeed') {
        applier = new IndeedApplier()
      } else if (source === 'jobstreet') {
        applier = new JobStreetApplier()
      } else {
        const integration = await prisma.userIntegration.findFirst({
          where: { userId: user.id, provider: 'linkedin' },
        })
        if (!integration) {
          return reply.status(403).send(
            failure('REQUIRES_AUTH', 'Hubungkan akun LinkedIn di Pengaturan > Integrasi')
          )
        }
        applier = new LinkedInApplier(integration.accessToken)
      }

      // Detect fields via Playwright
      let detectedFields
      try {
        detectedFields = await applier.detectFields(application.job.applyUrl)
      } catch (e: any) {
        if (e.message === 'requires_auth') {
          return reply.status(403).send(failure('REQUIRES_AUTH', 'Login diperlukan untuk platform ini'))
        }
        if (e.message === 'external_ats') {
          return reply.status(400).send(
            failure('EXTERNAL_ATS', 'Lowongan ini mengarah ke situs eksternal yang belum didukung')
          )
        }
        throw e
      }

      // Generate AI answers
      const answers = await generateFormAnswers(
        application.resume.content as ResumeContent,
        application.job.description,
        detectedFields
      )

      // Upsert session — langsung approved, skip pending_approval
      const session = await prisma.autoApplySession.upsert({
        where: { applicationId },
        create: {
          applicationId,
          status: 'approved',
          detectedFields,
          answers,
          siteUrl: application.job.applyUrl,
          source,
        },
        update: {
          status: 'approved',
          detectedFields,
          answers,
        },
      })

      await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { status: 'auto_applying' },
      })

      // Langsung enqueue
      const bullJob = await autoApplyQueue.add('submit' as never, {
        sessionId: session.id,
        applicationId,
        userId: user.id,
        jobId: application.jobId,
        siteUrl: session.siteUrl,
        source: source as SupportedSource,
        answers,
        resumeFileUrl: application.resume.fileUrl ?? undefined,
      } as never)

      return reply.send(success({ sessionId: session.id, jobId: bullJob.id, status: 'queued' }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal memulai auto-apply'))
    }
  })

  // GET /api/applications/:id/auto-apply/status
  app.get<{ Params: { id: string } }>('/:id/auto-apply/status', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const { id: applicationId } = request.params

      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, userId: user.id },
      })
      if (!application) {
        return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))
      }

      const session = await prisma.autoApplySession.findUnique({
        where: { applicationId },
        include: { logs: { orderBy: { createdAt: 'asc' } } },
      })
      if (!session) {
        return reply.status(404).send(failure('NOT_FOUND', 'Session tidak ditemukan'))
      }

      return reply.send(success(session))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal mengambil status auto-apply'))
    }
  })

  // DELETE /api/applications/:id/auto-apply — cancel jika belum submit
  app.delete<{ Params: { id: string } }>('/:id/auto-apply', async (request, reply) => {
    try {
      const user = request.user as { id: string }
      const { id: applicationId } = request.params

      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, userId: user.id },
      })
      if (!application) {
        return reply.status(404).send(failure('NOT_FOUND', 'Lamaran tidak ditemukan'))
      }

      const session = await prisma.autoApplySession.findUnique({ where: { applicationId } })
      if (!session) {
        return reply.status(404).send(failure('NOT_FOUND', 'Session tidak ditemukan'))
      }
      if (!['approved'].includes(session.status)) {
        return reply.status(400).send(
          failure('CANNOT_CANCEL', `Session dengan status ${session.status} tidak bisa dibatalkan`)
        )
      }

      await prisma.autoApplySession.update({
        where: { applicationId },
        data: { status: 'skipped' },
      })
      await prisma.jobApplication.update({
        where: { id: applicationId },
        data: { status: 'saved' },
      })

      return reply.send(success({ cancelled: true }))
    } catch (err) {
      request.log.error(err)
      return reply.status(500).send(failure('SERVER_ERROR', 'Gagal membatalkan auto-apply'))
    }
  })
}
