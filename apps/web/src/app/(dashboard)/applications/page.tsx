import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'

export const metadata = { title: 'Lamaran Saya' }

export default async function ApplicationsPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const applications = await prisma.jobApplication.findMany({
    where: { userId },
    include: {
      job: {
        select: { id: true, title: true, company: true, location: true, closingDate: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lamaran Saya</h1>
        <p className="mt-1 text-gray-500">{applications.length} total lamaran</p>
      </div>

      <KanbanBoard
        initialApplications={applications.map((app) => ({
          id: app.id,
          status: app.status,
          matchScore: app.matchScore,
          job: {
            id: app.job.id,
            title: app.job.title,
            company: app.job.company,
            location: app.job.location,
            closingDate: app.job.closingDate,
          },
        }))}
      />
    </div>
  )
}
