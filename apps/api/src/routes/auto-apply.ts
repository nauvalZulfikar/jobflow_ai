import type { FastifyInstance } from 'fastify'
import { prisma } from '@jobflow/db'
import { generateFormAnswers, openai, AI_MODEL } from '@jobflow/ai'
import { success, failure } from '@jobflow/shared'
import { autoApplyQueue } from '../plugins/auto-apply-queue.js'
import { GenericAIApplier } from '../appliers/generic-ai.applier.js'
import type { ResumeContent } from '@jobflow/shared'

const SUPPORTED_SOURCES = ['indeed', 'jobstreet', 'linkedin', 'glassdoor', 'kalibrr', 'techinasia', 'manual'] as const
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

      // Build GenericAI applier — works for all sources
      let linkedInCookie: string | undefined
      if (source === 'linkedin') {
        const integration = await prisma.userIntegration.findFirst({
          where: { userId: user.id, provider: 'linkedin' },
        })
        if (!integration) {
          return reply.status(403).send(
            failure('REQUIRES_AUTH', 'Hubungkan akun LinkedIn di Pengaturan > Integrasi')
          )
        }
        linkedInCookie = integration.accessToken
      }

      const applier = new GenericAIApplier({ linkedInCookie })
      const resumeContent = application.resume.content as ResumeContent
      applier.setContext(resumeContent, application.job.description)

      // Detect fields via Playwright
      let detectedFields
      try {
        detectedFields = await applier.detectFields(application.job.applyUrl)
      } catch (e: any) {
        if (e.message === 'requires_auth') {
          return reply.status(403).send(failure('REQUIRES_AUTH', 'Login diperlukan untuk platform ini'))
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
        resumeContent: resumeContent,
        jobDescription: application.job.description,
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

  // POST /api/auto-apply/vision-detect — AI-based form element detection from screenshot
  app.post('/vision-detect', async (request, reply) => {
    try {
      const { screenshot, url } = request.body as { screenshot: string; url: string }
      if (!screenshot) {
        return reply.status(400).send(failure('MISSING_SCREENSHOT', 'Screenshot required'))
      }

      const response = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are analyzing a job application page screenshot. Identify the submit/apply button and return a CSS selector that would match it. Also identify any unfilled required form fields. Return JSON only: { "submitSelector": "css selector string", "fields": [{ "label": "field name", "selector": "css selector" }] }. If you cannot find a submit button, return { "submitSelector": null, "fields": [] }.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This is a screenshot of a job application page at ${url}. Find the submit/apply button and any unfilled form fields.`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${screenshot}` },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        return reply.send(success(null))
      }

      const parsed = JSON.parse(content)
      return reply.send(success(parsed))
    } catch (err) {
      request.log.error(err)
      return reply.send(success(null)) // Don't fail the whole flow for vision errors
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
