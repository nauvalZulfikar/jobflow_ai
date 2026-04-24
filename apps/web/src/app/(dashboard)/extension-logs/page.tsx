import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata = { title: 'Extension Logs' }
export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<{ batchId?: string }> }

function levelColor(level: string) {
  if (level === 'error') return 'text-red-600'
  if (level === 'warn') return 'text-amber-600'
  return 'text-gray-700'
}

export default async function ExtensionLogsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const params = await searchParams
  let batchId = params.batchId

  if (!batchId) {
    const latest = await prisma.extensionActivityLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { batchId: true },
    })
    batchId = latest?.batchId
  }

  const batchRows = await prisma.$queryRaw<
    Array<{ batchId: string; count: bigint; startedAt: Date; lastAt: Date }>
  >`
    SELECT "batchId",
           COUNT(*)::bigint AS count,
           MIN("createdAt") AS "startedAt",
           MAX("createdAt") AS "lastAt"
    FROM "ExtensionActivityLog"
    WHERE "userId" = ${userId}
    GROUP BY "batchId"
    ORDER BY MAX("createdAt") DESC
    LIMIT 20
  `

  const entries = batchId
    ? await prisma.extensionActivityLog.findMany({
        where: { userId, batchId },
        orderBy: { createdAt: 'asc' },
        take: 500,
      })
    : []

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Extension Activity Log</h1>
        <p className="mt-1 text-gray-500">Auto-apply runs dari Chrome extension</p>
      </div>

      {batchRows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
          Belum ada log. Jalankan Auto-Apply dari extension untuk mulai mencatat.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
              Batches terbaru
            </div>
            <div className="divide-y divide-gray-100">
              {batchRows.map(b => {
                const active = b.batchId === batchId
                return (
                  <Link
                    key={b.batchId}
                    href={`/extension-logs?batchId=${encodeURIComponent(b.batchId)}`}
                    className={`flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 ${active ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-gray-500">{b.batchId}</span>
                      <span className="text-gray-800">
                        {new Date(b.startedAt).toLocaleString('id-ID')} — {Number(b.count)} entries
                      </span>
                    </div>
                    {active && <span className="text-xs text-blue-600">● current</span>}
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-sm font-medium text-gray-700">
              Log entries ({entries.length})
            </div>
            <div className="max-h-[600px] overflow-auto p-3 font-mono text-xs leading-relaxed">
              {entries.length === 0 ? (
                <div className="text-gray-400">No entries</div>
              ) : (
                entries.map(e => {
                  const meta = e.metadata as {
                    diagnosis?: { rootCause?: string; specifics?: string; canRetry?: boolean; fixSuggestion?: string }
                    reason?: string
                    kind?: string
                    jobTitle?: string
                    company?: string
                    applyUrl?: string
                    finalUrl?: string
                    questions?: Array<{ step: number; label: string; value: string; selector: string; source?: string }>
                    resumeUsed?: { url?: string | null; firstName?: string; lastName?: string; email?: string }
                    confirmationScreenshot?: string | null
                  } | null
                  const diag = meta?.diagnosis
                  const isAttempt = meta?.kind === 'apply_attempt'
                  return (
                    <div key={e.id} className={`whitespace-pre-wrap ${levelColor(e.level)}`}>
                      <span className="text-gray-400">[{new Date(e.createdAt).toLocaleTimeString('id-ID')}]</span>{' '}
                      {e.message}
                      {diag && (
                        <div className="ml-8 mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                          <div><span className="font-semibold">rootCause:</span> {diag.rootCause || '—'}</div>
                          {diag.specifics && <div><span className="font-semibold">specifics:</span> {diag.specifics}</div>}
                          {diag.fixSuggestion && <div><span className="font-semibold">fix:</span> {diag.fixSuggestion}</div>}
                          <div><span className="font-semibold">canRetry:</span> {String(diag.canRetry ?? '—')}</div>
                        </div>
                      )}
                      {isAttempt && (
                        <div className="ml-8 mt-2 rounded border border-green-200 bg-green-50 p-3 text-gray-800 font-sans">
                          <div className="mb-2 font-semibold text-green-900">
                            {meta?.jobTitle} <span className="text-green-700">@ {meta?.company}</span>
                          </div>
                          {meta?.resumeUsed && (
                            <div className="mb-2 text-xs text-gray-700">
                              <span className="font-semibold">Submitted as:</span>{' '}
                              {meta.resumeUsed.firstName} {meta.resumeUsed.lastName} ({meta.resumeUsed.email})
                              {meta.resumeUsed.url && (
                                <> · <a href={meta.resumeUsed.url} target="_blank" className="text-blue-600 underline">resume file</a></>
                              )}
                            </div>
                          )}
                          {Array.isArray(meta?.questions) && meta.questions.length > 0 && (
                            <div className="mb-2">
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-800">
                                Questions &amp; Answers ({meta.questions.length})
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-white/60 text-left">
                                    <th className="px-2 py-1 font-medium">Step</th>
                                    <th className="px-2 py-1 font-medium">Field</th>
                                    <th className="px-2 py-1 font-medium">Answer</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {meta.questions.map((q, i) => (
                                    <tr key={i} className="border-t border-green-100">
                                      <td className="px-2 py-1 text-gray-500">{q.step}</td>
                                      <td className="px-2 py-1">{q.label}</td>
                                      <td className="px-2 py-1 font-mono text-[11px] break-all">{q.value}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {meta?.confirmationScreenshot && (
                            <div>
                              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-800">
                                Confirmation screenshot
                              </div>
                              <img
                                src={meta.confirmationScreenshot}
                                alt="Confirmation"
                                className="max-h-96 w-auto rounded border border-gray-300"
                              />
                            </div>
                          )}
                          {meta?.applyUrl && (
                            <div className="mt-2 text-[11px] text-gray-500 break-all">
                              <a href={meta.applyUrl} target="_blank" className="underline">{meta.applyUrl}</a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
