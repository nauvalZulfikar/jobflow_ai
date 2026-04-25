import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { redirect } from 'next/navigation'
import { RuleEditor } from './rule-editor'

export const metadata = { title: 'Resume Rules' }
export const dynamic = 'force-dynamic'

export default async function ResumeRulesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const resumes = await prisma.resume.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })

  const initial = resumes.map(r => ({
    id: r.id,
    title: r.title,
    isDefault: r.isDefault,
    titleInclude: (r as any).titleInclude || [],
    titleExclude: (r as any).titleExclude || [],
  }))

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resume Auto-Pick Rules</h1>
        <p className="mt-1 text-gray-500">
          Pas extension run, resume yang dikirim tergantung judul job. Set keyword di tiap resume — kalau title match, pakai resume itu. Kalo gak ada match, fallback ke default.
        </p>
      </div>

      {resumes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Belum ada resume. <a href="/resume/new" className="text-blue-600 underline">Bikin satu</a> dulu.
        </div>
      ) : (
        <div className="space-y-3">
          {initial.map(r => (
            <RuleEditor key={r.id} resume={r} />
          ))}
        </div>
      )}
    </div>
  )
}
