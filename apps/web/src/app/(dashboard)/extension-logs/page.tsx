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
                entries.map(e => (
                  <div key={e.id} className={`whitespace-pre-wrap ${levelColor(e.level)}`}>
                    <span className="text-gray-400">[{new Date(e.createdAt).toLocaleTimeString('id-ID')}]</span>{' '}
                    {e.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
