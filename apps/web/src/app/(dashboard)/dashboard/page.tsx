import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { APPLICATION_STATUS_LABELS, timeAgo, formatSalary } from '@jobflow/shared'
import {
  Briefcase, TrendingUp, Clock, Bot, CalendarDays, MapPin, Wifi, Plus, FileText, Star,
} from 'lucide-react'
import Link from 'next/link'
import { ScraperQueueWidget } from '@/components/jobs/ScraperQueueWidget'
import { ScraperTrigger } from '@/components/jobs/ScraperTrigger'
import { AnalyticsCharts } from '@/components/analytics/AnalyticsCharts'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { ResumeCardMenu } from '@/components/resume/resume-card-menu'

export const metadata = { title: 'Dashboard' }

function monthLabel(date: Date) {
  return date.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
}

const TYPE_LABELS: Record<string, string> = {
  phone: 'Telepon', video: 'Video', onsite: 'Tatap Muka', technical: 'Teknikal',
}


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}) {
  const params = await searchParams
  const tab = params.tab ?? 'overview'
  const session = await auth()
  const userId = session!.user!.id!

  // Always fetch stats
  const applicationsByStatus = await prisma.jobApplication.groupBy({
    by: ['status'],
    where: { userId },
    _count: true,
  })
  const statusMap = Object.fromEntries(applicationsByStatus.map((s) => [s.status, s._count]))
  const total = applicationsByStatus.reduce((sum, s) => sum + s._count, 0)

  // Tab: Overview
  let overviewData: Awaited<ReturnType<typeof fetchOverview>> | null = null
  if (tab === 'overview') overviewData = await fetchOverview(userId, statusMap, total)

  // Tab: Jobs
  let jobsData: Awaited<ReturnType<typeof fetchJobs>> | null = null
  if (tab === 'jobs') jobsData = await fetchJobs(params, userId)

  // Tab: Applications
  let applicationsData: { id: string; status: string; matchScore: number | null; createdAt: Date; job: { id: string; title: string; company: string; location: string | null; closingDate: Date | null } }[] | null = null
  if (tab === 'applications') {
    const apps = await prisma.jobApplication.findMany({
      where: { userId },
      include: { job: { select: { id: true, title: true, company: true, location: true, closingDate: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    applicationsData = apps.map((app) => ({
      id: app.id,
      status: app.status,
      matchScore: app.matchScore,
      createdAt: app.createdAt,
      job: { id: app.job.id, title: app.job.title, company: app.job.company, location: app.job.location, closingDate: app.job.closingDate },
    }))
  }

  // Tab: Resume
  let resumeData: Awaited<ReturnType<typeof prisma.resume.findMany>> | null = null
  if (tab === 'resume') {
    resumeData = await prisma.resume.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
  }

  const responseRate = total > 0 ? Math.round(((total - (statusMap['saved'] ?? 0)) / total) * 100) : 0
  const interviewed = (statusMap['interview'] ?? 0) + (statusMap['offer'] ?? 0)
  const interviewRate = total > 0 ? Math.round((interviewed / total) * 100) : 0
  const offerRate = interviewed > 0 ? Math.round(((statusMap['offer'] ?? 0) / interviewed) * 100) : 0

  const stats = [
    { label: 'Total Lamaran', value: total, icon: Briefcase, color: 'bg-blue-500' },
    { label: 'Auto-applying', value: statusMap['auto_applying'] ?? 0, icon: Bot, color: 'bg-violet-500' },
    { label: 'Interview', value: statusMap['interview'] ?? 0, icon: TrendingUp, color: 'bg-green-500' },
    { label: 'Menunggu', value: (statusMap['applied'] ?? 0) + (statusMap['screening'] ?? 0), icon: Clock, color: 'bg-yellow-500' },
    { label: 'Response Rate', value: `${responseRate}%`, icon: TrendingUp, color: 'bg-emerald-500' },
    { label: 'Interview Rate', value: `${interviewRate}%`, icon: TrendingUp, color: 'bg-teal-500' },
    { label: 'Offer Rate', value: `${offerRate}%`, icon: TrendingUp, color: 'bg-orange-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hei, {session?.user?.name?.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-gray-500">Pantau semua aktivitas lamaran kerjamu</p>
        </div>
        {tab === 'jobs' && <ScraperTrigger />}
        {tab === 'resume' && (
          <Link
            href="/resume/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Buat Resume
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && overviewData && (
        <OverviewTab data={overviewData} />
      )}

      {tab === 'jobs' && jobsData && (
        <JobsTab data={jobsData} q={params.q} page={Number(params.page ?? 1)} appMap={jobsData.appMap} />
      )}

      {tab === 'applications' && applicationsData && (
        <div>
          <p className="mb-4 text-sm text-gray-500">{applicationsData.length} total lamaran</p>
          <KanbanBoard initialApplications={applicationsData} />
        </div>
      )}

      {tab === 'resume' && resumeData && (
        <ResumeTab resumes={resumeData} />
      )}
    </div>
  )
}

async function fetchOverview(
  userId: string,
  statusMap: Record<string, number>,
  total: number,
) {
  const [recentApplications, applications, upcomingInterviews, interviews] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: { job: { select: { title: true, company: true } } },
    }),
    prisma.jobApplication.findMany({
      where: { userId },
      select: { status: true, createdAt: true, job: { select: { source: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.interview.findMany({
      where: { application: { userId }, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      include: { application: { select: { job: { select: { title: true, company: true } } } } },
    }),
    prisma.interview.findMany({
      where: { application: { userId } },
      select: { scheduledAt: true, outcome: true },
      orderBy: { scheduledAt: 'asc' },
    }),
  ])

  const statusCount: Record<string, number> = {}
  for (const app of applications) statusCount[app.status] = (statusCount[app.status] ?? 0) + 1
  const statusData = Object.entries(statusCount).map(([status, count]) => ({
    status: APPLICATION_STATUS_LABELS[status] ?? status, count,
  }))
  const sourceCount: Record<string, number> = {}
  for (const app of applications) {
    const src = app.job.source
    sourceCount[src] = (sourceCount[src] ?? 0) + 1
  }
  const sourceData = Object.entries(sourceCount).map(([source, count]) => ({ source, count }))
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const timelineData = months.map(({ year, month }) => {
    const label = monthLabel(new Date(year, month, 1))
    const appCount = applications.filter((a) => {
      const d = new Date(a.createdAt)
      return d.getFullYear() === year && d.getMonth() === month
    }).length
    const intCount = interviews.filter((i) => {
      const d = new Date(i.scheduledAt)
      return d.getFullYear() === year && d.getMonth() === month
    }).length
    return { month: label, applications: appCount, interviews: intCount }
  })

  return { recentApplications, upcomingInterviews, statusData, timelineData, sourceData }
}

async function fetchJobs(params: { page?: string; q?: string }, userId: string) {
  const limit = 20
  const q = params.q
  const rawPage = Number(params.page ?? 1)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const where = {
    duplicateOf: null,
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { company: { contains: q, mode: 'insensitive' as const } }] } : {}),
  }
  const [jobs, total, userApps] = await Promise.all([
    prisma.job.findMany({ where, orderBy: { postedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.job.count({ where }),
    prisma.jobApplication.findMany({
      where: { userId },
      select: { jobId: true, status: true, createdAt: true },
    }),
  ])
  const appMap = Object.fromEntries(userApps.map((a) => [a.jobId, { status: a.status, createdAt: a.createdAt }]))
  return { jobs, total, page, limit, appMap }
}

function OverviewTab({ data }: { data: Awaited<ReturnType<typeof fetchOverview>> }) {
  const { recentApplications, upcomingInterviews, statusData, timelineData, sourceData } = data
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Aktivitas Terbaru</h2>
          {recentApplications.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada lamaran.</p>
          ) : (
            <div className="space-y-3">
              {recentApplications.map((app) => (
                <div key={app.id} className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{app.job.title}</p>
                    <p className="truncate text-xs text-gray-400">{app.job.company}</p>
                  </div>
                  <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scraper Queue */}
        <ScraperQueueWidget />

        {/* Upcoming Interviews */}
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-900">Interview Mendatang</h2>
          </div>
          {upcomingInterviews.length === 0 ? (
            <p className="text-sm text-gray-400">Tidak ada jadwal interview mendatang</p>
          ) : (
            <div className="space-y-3">
              {upcomingInterviews.map((iv) => (
                <div key={iv.id} className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{iv.application.job.title}</p>
                  <p className="text-xs text-gray-500">{iv.application.job.company}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {new Date(iv.scheduledAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                      {TYPE_LABELS[iv.type] ?? iv.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Analitik</h2>
        <AnalyticsCharts statusData={statusData} timelineData={timelineData} sourceData={sourceData} />
      </div>
    </div>
  )
}

function JobsTab({ data, q, page, appMap }: { data: Awaited<ReturnType<typeof fetchJobs>>; q?: string; page: number; appMap: Record<string, { status: string; createdAt: Date }> }) {
  const { jobs, total, limit } = data
  return (
    <div className="space-y-4">
      <form className="flex gap-3">
        <input type="hidden" name="tab" value="jobs" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari posisi atau perusahaan..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          Cari
        </button>
      </form>

      <p className="text-sm text-gray-500">{total} lowongan tersedia</p>

      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm">
            <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 text-gray-500">Belum ada lowongan tersedia</p>
            <p className="mt-1 text-sm text-gray-400">Klik &ldquo;Cari Lowongan Baru&rdquo; untuk mulai scraping</p>
          </div>
        ) : (
          jobs.map((job) => {
            const app = appMap[job.id]
            return (
            <div
              key={job.id}
              className="rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/jobs/${job.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                      {job.title}
                    </Link>
                    {app && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        ✓ Dilamar · {new Date(app.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">{job.company}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    {job.location && (
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                    )}
                    {job.isRemote && (
                      <span className="flex items-center gap-1 text-green-600"><Wifi className="h-3.5 w-3.5" />Remote</span>
                    )}
                    {job.postedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />{timeAgo(new Date(job.postedAt))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {job.salaryMin && job.salaryMax && (
                    <p className="text-sm font-medium text-gray-700">{formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)}</p>
                  )}
                  <span className="inline-block mt-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">{job.source}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Lamar
                </a>
                <Link
                  href={`/jobs/${job.id}`}
                  className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Detail
                </Link>
              </div>
            </div>
          )})
        )}
      </div>

      {total > limit && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <a href={`?tab=jobs&page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              ← Sebelumnya
            </a>
          )}
          {page * limit < total && (
            <a href={`?tab=jobs&page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              Berikutnya →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ResumeTab({ resumes }: { resumes: Awaited<ReturnType<typeof prisma.resume.findMany>> }) {
  if (resumes.length === 0) {
    return (
      <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-dashed border-gray-200">
        <FileText className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-3 text-lg font-medium text-gray-900">Belum Ada Resume</h3>
        <p className="mt-1 text-sm text-gray-500">Buat resume pertamamu atau upload file PDF/DOCX</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/resume/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Buat Resume
          </Link>
          <Link href="/resume/upload" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Upload PDF/DOCX
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {resumes.map((resume) => (
        <div key={resume.id} className="group relative rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
          {resume.isDefault && (
            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-600">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              Default
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="truncate font-medium text-gray-900">{resume.title}</h3>
              <p className="text-xs text-gray-400">Versi {resume.version} · Diperbarui {timeAgo(new Date(resume.updatedAt))}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link href={`/resume/${resume.id}`} className="flex-1 rounded-lg border border-gray-200 py-1.5 text-center text-sm font-medium text-gray-600 hover:bg-gray-50">
              Edit
            </Link>
            <ResumeCardMenu resumeId={resume.id} isDefault={resume.isDefault} />
          </div>
        </div>
      ))}
    </div>
  )
}
