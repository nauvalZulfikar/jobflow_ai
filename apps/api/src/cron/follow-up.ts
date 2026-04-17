import { prisma } from '@jobflow/db'

const EXCLUDED_STATUSES = ['offer', 'rejected', 'withdrawn']

export async function processFollowUpReminders(): Promise<void> {
  try {
    const now = new Date()

    const applications = await prisma.jobApplication.findMany({
      where: {
        followUpDate: { lte: now },
        status: { notIn: EXCLUDED_STATUSES },
      },
      include: {
        job: { select: { company: true } },
      },
    })

    for (const application of applications) {
      const company = application.job.company
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      // Check if there's already an unread follow_up_reminder for this application in the last 24h
      const existing = await prisma.notification.findFirst({
        where: {
          userId: application.userId,
          type: 'follow_up_reminder',
          isRead: false,
          createdAt: { gte: cutoff },
          body: { contains: company },
        },
      })

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: application.userId,
            type: 'follow_up_reminder',
            title: 'Saatnya follow up!',
            body: `Sudah waktunya follow up untuk lamaran di ${company}`,
            link: '/applications',
            isRead: false,
          },
        })
      }
    }
  } catch (err) {
    console.error('[follow-up cron] Error:', err)
  }
}
