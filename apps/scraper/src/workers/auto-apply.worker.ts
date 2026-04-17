import { Worker } from 'bullmq'
import { prisma } from '@jobflow/db'
import type { AutoApplyJobData } from '@jobflow/shared'
import { createRedisConnection } from '../queues/index.js'
import { AUTO_APPLY_QUEUE_NAME } from '../queues/auto-apply-queue.js'
import { IndeedApplier } from '../appliers/indeed.applier.js'
import { JobStreetApplier } from '../appliers/jobstreet.applier.js'
import { LinkedInApplier } from '../appliers/linkedin.applier.js'

async function addLog(sessionId: string, level: string, step: string, message: string) {
  await prisma.autoApplyLog.create({ data: { sessionId, level, step, message } })
}

export function startAutoApplyWorker() {
  const worker = new Worker<AutoApplyJobData>(
    AUTO_APPLY_QUEUE_NAME,
    async (job) => {
      const { sessionId, applicationId, source, siteUrl, answers, resumeFileUrl, userId } = job.data

      await prisma.autoApplySession.update({ where: { id: sessionId }, data: { status: 'submitting' } })
      await addLog(sessionId, 'info', 'submit', `Starting ${source} submission`)

      // Select applier
      let applier
      if (source === 'indeed') {
        applier = new IndeedApplier()
      } else if (source === 'jobstreet') {
        applier = new JobStreetApplier()
      } else if (source === 'linkedin') {
        const integration = await prisma.userIntegration.findFirst({
          where: { userId, provider: 'linkedin' },
        })
        applier = new LinkedInApplier(integration?.accessToken)
      } else {
        throw new Error(`Unsupported source: ${source}`)
      }

      await addLog(sessionId, 'info', 'submit', `Applier ready, navigating to ${siteUrl}`)

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
