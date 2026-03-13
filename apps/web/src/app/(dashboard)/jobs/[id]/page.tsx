import { prisma } from '@jobflow/db'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Wifi, Clock, ExternalLink, ArrowLeft, Briefcase } from 'lucide-react'
import { timeAgo, formatSalary } from '@jobflow/shared'
import { MatchScoreCard } from '@/components/jobs/MatchScoreCard'
import { ApplyButton } from '@/components/jobs/ApplyButton'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const job = await prisma.job.findUnique({ where: { id: params.id }, select: { title: true } })
  return { title: job?.title ?? 'Detail Lowongan' }
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const session = await auth()
  const userId = session?.user?.id

  const [job, activeResume, existingApp] = await Promise.all([
    prisma.job.findUnique({ where: { id: params.id } }),
    userId
      ? prisma.resume.findFirst({
          where: { userId, isDefault: true },
          select: { id: true, title: true, rawText: true },
        })
      : null,
    userId
      ? prisma.jobApplication.findFirst({
          where: { userId, jobId: params.id },
          select: { id: true },
        })
      : null,
  ])

  if (!job) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke daftar
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Job Header */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
                <p className="mt-1 text-gray-600">{job.company}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </span>
                  )}
                  {job.jobType ? (
                    <span className="flex items-center gap-1.5">
                      {job.jobType === 'remote' ? <Wifi className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                      {job.jobType === 'remote' ? 'Remote' : job.jobType === 'hybrid' ? 'Hybrid' : 'On-site'}
                    </span>
                  ) : job.isRemote ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <Wifi className="h-4 w-4" />
                      Remote
                    </span>
                  ) : null}
                  {job.postedAt && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {timeAgo(new Date(job.postedAt))}
                    </span>
                  )}
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 capitalize flex-shrink-0">
                {job.source}
              </span>
            </div>

            {job.salaryMin && job.salaryMax && (
              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-500">Estimasi Gaji</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)}
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Deskripsi Pekerjaan</h2>
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {job.description}
            </div>
          </div>

          {/* Requirements */}
          {job.requirements && (
            <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">Persyaratan</h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {job.requirements}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Apply CTA */}
          <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              Lamar Sekarang
            </a>

            {userId && (
              <div className="mt-2">
                <ApplyButton jobId={job.id} />
              </div>
            )}
          </div>

          {/* Match Score */}
          {userId && (
            <MatchScoreCard
              jobId={job.id}
              resumeId={activeResume?.id}
              resumeTitle={activeResume?.title}
              applicationId={existingApp?.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}
