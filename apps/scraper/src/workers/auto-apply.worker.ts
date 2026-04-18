import { Worker } from 'bullmq'
import { prisma } from '@jobflow/db'
import type { AutoApplyJobData } from '@jobflow/shared'
import { createRedisConnection } from '../queues/index.js'
import { AUTO_APPLY_QUEUE_NAME } from '../queues/auto-apply-queue.js'
import { GenericAIApplier } from '../appliers/generic-ai.applier.js'

async function addLog(sessionId: string, level: string, step: string, message: string) {
  await prisma.autoApplyLog.create({ data: { sessionId, level, step, message } })
}

export function startAutoApplyWorker() {
  const worker = new Worker<AutoApplyJobData>(
    AUTO_APPLY_QUEUE_NAME,
    async (job) => {
      const { sessionId, applicationId, source, siteUrl, answers, resumeFileUrl, userId } = job.data
      const jobData = job.data as AutoApplyJobData & { resumeContent?: any; jobDescription?: string }

      await prisma.autoApplySession.update({ where: { id: sessionId }, data: { status: 'submitting' } })
      await addLog(sessionId, 'info', 'submit', `Starting ${source} submission via GenericAI`)

      // Build GenericAI applier
      let linkedInCookie: string | undefined
      if (source === 'linkedin') {
        const integration = await prisma.userIntegration.findFirst({
          where: { userId, provider: 'linkedin' },
        })
        linkedInCookie = integration?.accessToken
      }

      const applier = new GenericAIApplier({ linkedInCookie })

      // Set resume context for AI planning
      if (jobData.resumeContent && jobData.jobDescription) {
        applier.setContext(jobData.resumeContent, jobData.jobDescription)
      } else {
        // Fallback: fetch from DB
        const application = await prisma.jobApplication.findUnique({
          where: { id: applicationId },
          include: { resume: true, job: true },
        })
        if (application?.resume?.content && application?.job?.description) {
          applier.setContext(application.resume.content as any, application.job.description)
        }
      }

      await addLog(sessionId, 'info', 'submit', `Navigating to ${siteUrl}`)

      const result = await applier.apply(siteUrl, answers, resumeFileUrl)

      if (result.success) {
        await prisma.autoApplySession.update({
          where: { id: sessionId },
          data: { status: 'submitted', submittedAt: new Date(), screenshotUrl: result.screenshotUrl ?? null },
        })
        await prisma.jobApplication.update({
          where: { id: applicationId },
          data: { status: 'applied', appliedAt: new Date() },
        })
        await prisma.applicationLog.create({
          data: {
            applicationId,
            action: 'status_changed',
            detail: 'Berhasil dilamar otomatis via JobFlow Auto-Apply',
          },
        })
        await prisma.notification.create({
          data: {
            userId,
            type: 'status_update',
            title: 'Lamaran Berhasil Dikirim',
            body: 'Auto-apply selesai. Pantau perkembangannya di dashboard.',
            link: `/applications/${applicationId}`,
          },
        })
        await addLog(sessionId, 'info', 'submit', 'Submission successful')
      } else {
        await prisma.autoApplySession.update({
          where: { id: sessionId },
          data: { status: 'failed', failureReason: result.errorMessage ?? 'Unknown error' },
        })
        await prisma.jobApplication.update({
          where: { id: applicationId },
          data: { status: 'saved' },
        })
        await prisma.notification.create({
          data: {
            userId,
            type: 'status_update',
            title: 'Auto-apply Gagal',
            body: result.errorMessage ?? 'Terjadi kesalahan. Silakan coba lamar secara manual.',
            link: `/applications/${applicationId}`,
          },
        })
        await addLog(sessionId, 'error', 'submit', result.errorMessage ?? 'Submission failed')
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: createRedisConnection() as any,
      concurrency: 1,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[auto-apply] job ${job?.id} failed:`, err.message)
  })

  return worker
}
