import { prisma } from '@jobflow/db'
import { Briefcase, MapPin, Clock, Wifi } from 'lucide-react'
import { timeAgo, formatSalary } from '@jobflow/shared'
import Link from 'next/link'
import { ScraperTrigger } from '@/components/jobs/ScraperTrigger'

export const metadata = { title: 'Cari Lowongan' }

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const params = await searchParams
  const limit = 20
  const q = params.q
  const rawPage = Number(params.page ?? 1)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const where = {
    duplicateOf: null,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { company: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { postedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cari Lowongan</h1>
          <p className="mt-1 text-gray-500">{total} lowongan tersedia</p>
        </div>
        <ScraperTrigger />
      </div>

      {/* Search */}
      <form className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari posisi atau perusahaan..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Cari
        </button>
      </form>

      {/* Job List */}
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm">
            <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 text-gray-500">Belum ada lowongan tersedia</p>
            <p className="mt-1 text-sm text-gray-400">
              Klik &ldquo;Cari Lowongan Baru&rdquo; untuk mulai scraping
            </p>
          </div>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="block rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{job.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-600">{job.company}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                      </span>
                    )}
                    {job.isRemote && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Wifi className="h-3.5 w-3.5" />
                        Remote
                      </span>
                    )}
                    {job.postedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {timeAgo(new Date(job.postedAt))}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  {job.salaryMin && job.salaryMax && (
                    <p className="text-sm font-medium text-gray-700">
                      {formatSalary(job.salaryMin)} – {formatSalary(job.salaryMax)}
                    </p>
                  )}
                  <span className="inline-block mt-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">
                    {job.source}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2" onClick={(e) => e.preventDefault()}>
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Lamar
                </a>
                <Link
                  href={`/jobs/${job.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Detail
                </Link>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <a
              href={`?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
            >
              ← Sebelumnya
            </a>
          )}
          {page * limit < total && (
            <a
              href={`?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Berikutnya →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
