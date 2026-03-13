import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { Plus, FileText, Star } from 'lucide-react'
import Link from 'next/link'
import { timeAgo } from '@jobflow/shared'
import { ResumeCardMenu } from '@/components/resume/resume-card-menu'

export const metadata = { title: 'Resume & Profil' }

export default async function ResumePage() {
  const session = await auth()
  const userId = session!.user!.id!

  const resumes = await prisma.resume.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resume & Profil</h1>
          <p className="mt-1 text-gray-500">Kelola semua versi resume kamu</p>
        </div>
        <Link
          href="/resume/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Buat Resume Baru
        </Link>
      </div>

      {resumes.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-dashed border-gray-200">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-3 text-lg font-medium text-gray-900">Belum Ada Resume</h3>
          <p className="mt-1 text-sm text-gray-500">
            Buat resume pertamamu atau upload file PDF/DOCX
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/resume/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Buat Resume
            </Link>
            <Link
              href="/resume/upload"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Upload PDF/DOCX
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="group relative rounded-xl bg-white p-5 shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
            >
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
                  <p className="text-xs text-gray-400">
                    Versi {resume.version} · Diperbarui {timeAgo(new Date(resume.updatedAt))}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/resume/${resume.id}`}
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Edit
                </Link>
                <ResumeCardMenu resumeId={resume.id} isDefault={resume.isDefault} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
