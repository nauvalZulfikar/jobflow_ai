/**
 * Auto-Apply Pipeline Worker
 *
 * Runs after each scrape batch:
 * 1. Finds users with autoApplyEnabled = true
 * 2. Finds new jobs with no existing application
 * 3. For each job: navigates to LinkedIn Easy Apply, fills & submits form
 * 4. Creates JobApplication with status "applied" on success, "saved" on failure
 */

import { prisma } from '@jobflow/db'
import { generateFormAnswers } from '@jobflow/ai'
import type { ResumeContent } from '@jobflow/shared'
import { LinkedInApplier } from '../appliers/linkedin.applier.js'
import pino from 'pino'

const logger = pino({ name: 'auto-apply-pipeline' })

const SUPPORTED_SOURCES = ['linkedin', 'indeed', 'jobstreet', 'glints'] as const

export async function runAutoApplyPipeline() {
  logger.info('Auto-apply pipeline starting')

  const users = await prisma.user.findMany({
    where: { autoApplyEnabled: true, autoApplyResumeId: { not: null } },
  })

  if (users.length === 0) {
    logger.info('No users with auto-apply enabled')
    return
  }

  for (const user of users) {
    try {
      await processUser(user)
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Pipeline failed for user')
    }
  }

  logger.info('Auto-apply pipeline complete')
}

async function processUser(user: { id: string; autoApplyResumeId: string | null; autoApplyMaxDaily: number }) {
  const resume = await prisma.resume.findUnique({ where: { id: user.autoApplyResumeId! } })
  if (!resume) {
    logger.warn({ userId: user.id }, 'Resume not found, skipping')
    return
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = await prisma.jobApplication.count({
    where: { userId: user.id, status: 'applied', createdAt: { gte: todayStart } },
  })

  const remaining = user.autoApplyMaxDaily - todayCount
  if (remaining <= 0) {
    logger.info({ userId: user.id, todayCount }, 'Daily limit reached')
    return
  }

  // Find jobs with no existing application
  const existingJobIds = await prisma.jobApplication
    .findMany({ where: { userId: user.id }, select: { jobId: true } })
    .then((rows) => rows.map((r) => r.jobId))

  const newJobs = await prisma.job.findMany({
    where: {
      duplicateOf: null,
      source: { in: [...SUPPORTED_SOURCES] },
      id: existingJobIds.length ? { notIn: existingJobIds } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: remaining,
  })

  if (newJobs.length === 0) {
    logger.info({ userId: user.id }, 'No new jobs to apply to')
    return
  }

  logger.info({ userId: user.id, count: newJobs.length }, 'Starting auto-apply')

  const linkedinIntegration = await prisma.userIntegration.findFirst({
    where: { userId: user.id, provider: 'linkedin' },
  })

  const applier = new LinkedInApplier(linkedinIntegration?.accessToken ?? undefined)
  let applied = 0

  for (const job of newJobs) {
    const appData = {
      userId: user.id,
      jobId: job.id,
      resumeId: resume.id,
    }

    try {
      // Detect form fields
      let detectedFields
      try {
        detectedFields = await applier.detectFields(job.applyUrl)
      } catch (e: any) {
        logger.warn({ jobId: job.id, err: e.message }, 'Field detection failed — saving as draft')
        await prisma.jobApplication.upsert({
          where: { userId_jobId: { userId: user.id, jobId: job.id } },
          create: { ...appData, status: 'saved' },
          update: {},
        })
        continue
      }

      // Generate AI answers
      const answers = await generateFormAnswers(
        resume.content as ResumeContent,
        job.description,
        detectedFields
      )

      // Submit application
      const result = await applier.apply(job.applyUrl, answers, resume.fileUrl ?? undefined)

      if (result.success) {
        await prisma.jobApplication.upsert({
          where: { userId_jobId: { userId: user.id, jobId: job.id } },
          create: { ...appData, status: 'applied', appliedAt: new Date() },
          update: { status: 'applied', appliedAt: new Date() },
        })
        applied++
        logger.info({ jobId: job.id, title: job.title, company: job.company }, '✅ Applied successfully')
      } else {
        await prisma.jobApplication.upsert({
          where: { userId_jobId: { userId: user.id, jobId: job.id } },
          create: { ...appData, status: 'saved', notes: result.errorMessage ?? undefined },
          update: {},
        })
        logger.warn({ jobId: job.id, err: result.errorMessage }, 'Apply failed — saved as draft')
      }

      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000))
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Unexpected error — saving as draft')
      await prisma.jobApplication.upsert({
        where: { userId_jobId: { userId: user.id, jobId: job.id } },
        create: { ...appData, status: 'saved' },
        update: {},
      }).catch(() => {})
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { autoApplyLastRunAt: new Date() },
  })

  if (applied > 0) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'new_job',
        title: `${applied} lamaran berhasil dikirim`,
        body: `Auto-apply berhasil melamar ke ${applied} lowongan baru.`,
        link: '/dashboard?tab=applications',
      },
    })
  }

  logger.info({ userId: user.id, applied }, 'Pipeline done for user')
}
