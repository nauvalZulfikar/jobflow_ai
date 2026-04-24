import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Applied Jobs' }
export const dynamic = 'force-dynamic'

type ApplyAttemptMeta = {
  kind?: string
  jobTitle?: string
  company?: string
  applyUrl?: string
  finalUrl?: string
  questions?: Array<{ step: number; label: string; value: string; selector: string; source?: string }>
  resumeUsed?: { url?: string | null; firstName?: string; lastName?: string; email?: string }
  confirmationScreenshot?: string | null
}

export default async function AppliedJobsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  // All applied JobApplications for the user
  const applied = await prisma.jobApplication.findMany({
    where: { userId, status: 'applied' },
    orderBy: { appliedAt: 'desc' },
    include: { job: true },
    take: 200,
  })

  // All apply_attempt log entries for those applications, keyed by applicationId
  const appIds = applied.map(a => a.id)
  const attemptLogs = appIds.length > 0
    ? await prisma.extensionActivityLog.findMany({
        where: { userId, applicationId: { in: appIds } },
        orderBy: { createdAt: 'desc' },
      })
    : []

  // Pick the richest apply_attempt log per application (has screenshot, otherwise most recent)
  const attemptByApp = new Map<string, ApplyAttemptMeta & { createdAt: Date }>()
  for (const log of attemptLogs) {
    const meta = (log.metadata ?? null) as ApplyAttemptMeta | null
    if (!meta || meta.kind !== 'apply_attempt') continue
    const appId = log.applicationId
    if (!appId) continue
    const existing = attemptByApp.get(appId)
    if (!existing || (meta.confirmationScreenshot && !existing.confirmationScreenshot)) {
      attemptByApp.set(appId, { ...meta, createdAt: log.createdAt })
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Applied Jobs</h1>
        <p className="mt-1 text-gray-500">
          {applied.length} applications · dokumentasi Q&amp;A, resume, dan screenshot dari auto-apply extension.
        </p>
      </div>

      {applied.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Belum ada job yang di-apply.
        </div>
      ) : (
        <div className="space-y-4">
          {applied.map(app => {
            const meta = attemptByApp.get(app.id)
            const untracked = !meta
            return (
              <details
                key={app.id}
                className={`rounded-lg border bg-white ${untracked ? 'border-amber-200' : 'border-gray-200'}`}
              >
                <summary className="flex cursor-pointer items-start justify-between gap-3 px-5 py-4 hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{app.job.title}</div>
                    <div className="text-sm text-gray-600">{app.job.company} · {app.job.location || '—'}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {app.appliedAt
                        ? new Date(app.appliedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                      {' · '}
                      <a href={app.job.applyUrl || '#'} target="_blank" className="text-blue-600 hover:underline">
                        {app.job.source || 'link'}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {untracked ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Untracked</span>
                    ) : (
                      <>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
                          {meta.questions?.length || 0} Q&amp;A
                        </span>
                        {meta.confirmationScreenshot && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                            Screenshot
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </summary>

                <div className="border-t border-gray-100 px-5 py-4">
                  {untracked ? (
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="font-semibold">No audit trail</div>
                      <div className="text-xs">
                        This application was marked as applied without the extension recording Q&amp;A or screenshot.
                        Either it was submitted via an older extension version or bypassed the documentation layer.
                        {app.notes && <><br/><span className="font-semibold">Notes:</span> {app.notes}</>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {meta.resumeUsed && (
                        <div className="text-sm">
                          <span className="font-semibold text-gray-800">Submitted as:</span>{' '}
                          {meta.resumeUsed.firstName} {meta.resumeUsed.lastName} ({meta.resumeUsed.email})
                          {meta.resumeUsed.url && (
                            <> · <a href={meta.resumeUsed.url} target="_blank" className="text-blue-600 hover:underline">resume file</a></>
                          )}
                        </div>
                      )}

                      {Array.isArray(meta.questions) && meta.questions.length > 0 && (
                        <div>
                          <div className="mb-2 text-sm font-semibold text-gray-800">
                            Questions &amp; Answers ({meta.questions.length})
                          </div>
                          <div className="overflow-hidden rounded border border-gray-200">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                                <tr>
                                  <th className="px-3 py-2">Step</th>
                                  <th className="px-3 py-2">Field</th>
                                  <th className="px-3 py-2">Answer</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {meta.questions.map((q, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 text-gray-500">{q.step}</td>
                                    <td className="px-3 py-2 text-gray-900">{q.label}</td>
                                    <td className="px-3 py-2 font-mono text-xs break-all text-gray-700">{q.value}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {meta.confirmationScreenshot ? (
                        <div>
                          <div className="mb-2 text-sm font-semibold text-gray-800">Confirmation screenshot</div>
                          <img
                            src={meta.confirmationScreenshot}
                            alt={`Confirmation for ${app.job.title}`}
                            className="max-h-[480px] w-auto rounded border border-gray-300"
                          />
                        </div>
                      ) : (
                        <div className="text-xs italic text-gray-500">
                          (Confirmation screenshot tidak tersimpan untuk submission ini.)
                        </div>
                      )}

                      {meta.finalUrl && meta.finalUrl !== meta.applyUrl && (
                        <div className="text-xs text-gray-500">
                          Final URL (post-submit):{' '}
                          <a href={meta.finalUrl} target="_blank" className="text-blue-600 hover:underline break-all">
                            {meta.finalUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
