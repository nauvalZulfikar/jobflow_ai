import { auth } from '@/auth'
import { prisma } from '@jobflow/db'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Auto-Apply Failures' }
export const dynamic = 'force-dynamic'

type Diagnosis = {
  rootCause?: string
  fixCategory?: string
  suggestedFix?: string
  confidence?: number
  skipForNow?: boolean
}

export default async function FailuresPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [failures, recipes] = await Promise.all([
    prisma.autoApplyFailure.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.applyRecipe.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auto-Apply Failures &amp; Self-Heal</h1>
        <p className="mt-1 text-gray-500">
          {failures.length} stuck cases · {recipes.length} recipes active
        </p>
      </div>

      {recipes.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-2 text-sm font-semibold text-blue-900">Active skip recipes</div>
          <ul className="space-y-1 text-xs">
            {recipes.map(r => (
              <li key={r.id} className="flex items-start gap-2">
                <span className={`rounded px-2 py-0.5 font-mono ${r.skipSite ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                  {r.skipSite ? 'SKIP' : 'RULE'}
                </span>
                <span className="font-mono text-blue-700">{r.urlPattern}</span>
                <span className="text-gray-600">{r.reason}</span>
                {r.confidence && <span className="text-gray-400">({r.confidence}%)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failures.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Belum ada failures. Run extension + biar bot stuck pada 1-2 site, abis itu diagnosis otomatis.
        </div>
      ) : (
        <div className="space-y-3">
          {failures.map(f => {
            const diag = f.diagnosis as Diagnosis | null
            const hist = f.historySnippet as any
            const confBadge = diag?.confidence
              ? `${diag.confidence >= 80 ? 'bg-green-100 text-green-800' : diag.confidence >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`
              : 'bg-gray-100 text-gray-500'
            return (
              <details key={f.id} className="rounded-lg border border-gray-200 bg-white">
                <summary className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-mono text-red-800">{f.reason}</span>
                      <span className="truncate font-mono text-xs text-gray-700">{f.hostPattern}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(f.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      {f.recipeId && <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-green-700">recipe-linked</span>}
                    </div>
                  </div>
                  {diag && (
                    <span className={`rounded px-2 py-0.5 text-xs ${confBadge}`}>
                      {diag.fixCategory || '—'} · {diag.confidence || 0}%
                    </span>
                  )}
                </summary>
                <div className="border-t border-gray-100 px-4 py-3 space-y-3 text-sm">
                  <div>
                    <a href={f.url} target="_blank" className="break-all text-blue-600 hover:underline">
                      {f.url}
                    </a>
                  </div>

                  {diag && (
                    <div className="rounded bg-amber-50 border border-amber-200 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-1">AI Diagnosis</div>
                      <div><span className="font-semibold">Root cause:</span> {diag.rootCause}</div>
                      <div><span className="font-semibold">Fix category:</span> {diag.fixCategory}</div>
                      <div><span className="font-semibold">Suggestion:</span> {diag.suggestedFix}</div>
                      <div><span className="font-semibold">Confidence:</span> {diag.confidence}%</div>
                    </div>
                  )}

                  {hist && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">History</div>
                      {hist.doc?.lastButtons && (
                        <div className="text-xs text-gray-700">
                          <span className="font-semibold">Buttons seen:</span> {(hist.doc.lastButtons as string[]).join(' | ')}
                        </div>
                      )}
                      {hist.doc?.lastFields && hist.doc.lastFields.length > 0 && (
                        <div className="text-xs text-gray-700">
                          <span className="font-semibold">Fields seen:</span> {(hist.doc.lastFields as any[]).map(f => f.label).join(', ')}
                        </div>
                      )}
                      {hist.doc?.qa && hist.doc.qa.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">Q&amp;A attempted ({hist.doc.qa.length})</summary>
                          <pre className="mt-1 overflow-auto rounded bg-gray-900 p-2 text-[11px] text-gray-100">{JSON.stringify(hist.doc.qa, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {f.domSnippet && (
                    <details>
                      <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">DOM snippet</summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-100 p-2 text-[11px]">{f.domSnippet.slice(0, 1500)}</pre>
                    </details>
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
