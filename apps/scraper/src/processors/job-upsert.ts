import { prisma } from '@jobflow/db'
import type { ScrapedJob } from '@jobflow/shared'
import pino from 'pino'

const logger = pino({ name: 'job-upsert' })

export async function upsertJob(job: ScrapedJob): Promise<{ created: boolean; id: string }> {
  if (!job.externalId) {
    throw new Error('Job missing externalId')
  }

  const result = await prisma.job.upsert({
    where: {
      source_externalId: {
        source: job.source,
        externalId: job.externalId,
      },
    },
    create: {
      externalId: job.externalId,
      source: job.source,
      title: job.title,
      company: job.company,
      location: job.location ?? null,
      description: job.description || '(no description)',
      requirements: job.requirements ?? null,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      currency: job.currency ?? 'IDR',
      isRemote: job.isRemote ?? false,
      jobType: job.jobType ?? null,
      applyUrl: job.applyUrl,
      postedAt: job.postedAt ?? null,
    },
    update: {
      title: job.title,
      company: job.company,
      salaryMin: job.salaryMin ?? undefined,
      salaryMax: job.salaryMax ?? undefined,
      postedAt: job.postedAt ?? undefined,
      // Mark as active again if it was previously seen
    },
    select: { id: true, createdAt: true, updatedAt: true },
  })

  const created = result.createdAt.getTime() === result.updatedAt.getTime()

  // Cross-source deduplication: mark as duplicate if same title+company+location exists from another source
  if (created) {
    const existing = await prisma.job.findFirst({
      where: {
        title: { equals: job.title, mode: 'insensitive' },
        company: { equals: job.company, mode: 'insensitive' },
        location: job.location ? { equals: job.location, mode: 'insensitive' } : undefined,
        source: { not: job.source },
        duplicateOf: null,
        id: { not: result.id },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })

    if (existing) {
      await prisma.job.update({
        where: { id: result.id },
        data: { duplicateOf: existing.id },
      })
      logger.debug({ id: result.id, masterJobId: existing.id }, 'Marked as duplicate')
    }
  }

  return { created, id: result.id }
}
