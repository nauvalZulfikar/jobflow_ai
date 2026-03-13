import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { APPLICATION_STATUS_LABELS } from '@jobflow/shared'
import { Briefcase, FileText, TrendingUp, Clock, Database } from 'lucide-react'
import { ScraperQueueWidget } from '@/components/jobs/ScraperQueueWidget'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth()
  const userId = session!.user!.id!

  const [totalApplications, applicationsByStatus, recentApplications, totalResumes, totalJobs] =
    await Promise.all([
      prisma.jobApplication.count({ where: { userId } }),
      prisma.jobApplication.groupBy({ by: ['status'], where: { userId }, _count: true }),
      prisma.jobApplication.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { job: { select: { title: true, company: true } } },
      }),
      prisma.resume.count({ where: { userId } }),
      prisma.job.count({ where: { duplicateOf: null } }),
    ])

  const statusMap = Object.fromEntries(
    applicationsByStatus.map((s) => [s.status, s._count])
  )

  const stats = [
    {
      label: 'Total Lamaran',
      value: totalApplications,
      icon: Briefcase,
      color: 'bg-blue-500',
    },
    {
      label: 'Wawancara',
      value: statusMap['interview'] ?? 0,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      label: 'Menunggu Respons',
      value: (statusMap['applied'] ?? 0) + (statusMap['screening'] ?? 0),
      icon: Clock,
      color: 'bg-yellow-500',
    },
    {
      label: 'Resume Tersimpan',
      value: totalResumes,
      icon: FileText,
      color: 'bg-purple-500',
    },
    {
      label: 'Lowongan Tersedia',
      value: totalJobs,
      icon: Database,
      color: 'bg-orange-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Selamat datang, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-gray-500">Ini adalah ringkasan aktivitas lamaran kerjamu</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Status Breakdown */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Status Lamaran</h2>
          <div className="space-y-3">
            {Object.entries(APPLICATION_STATUS_LABELS).map(([status, label]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {statusMap[status] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Aktivitas Terbaru</h2>
          {recentApplications.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada lamaran. Mulai cari lowongan!</p>
          ) : (
            <div className="space-y-3">
              {recentApplications.map((app) => (
                <div key={app.id} className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{app.job.title}</p>
                    <p className="text-xs text-gray-400">{app.job.company}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scraper Queue */}
        <ScraperQueueWidget />
      </div>
    </div>
  )
}
