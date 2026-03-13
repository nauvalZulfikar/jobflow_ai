'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { APPLICATION_STATUS_LABELS } from '@jobflow/shared'

const STATUS_COLORS: Record<string, string> = {
  saved: 'bg-gray-100 text-gray-700',
  applied: 'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-500',
}

export interface ApplicationCard {
  id: string
  status: string
  matchScore: number | null
  job: {
    id: string
    title: string
    company: string
    location: string | null
    closingDate: Date | null
  }
}

interface Props {
  app: ApplicationCard
  onClick: (app: ApplicationCard) => void
}

export function KanbanCard({ app, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id,
    data: { type: 'card', app },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const now = new Date()
  const isUrgent =
    app.job.closingDate &&
    new Date(app.job.closingDate).getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000 &&
    new Date(app.job.closingDate).getTime() > now.getTime()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(app)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(app) } }}
      className="rounded-lg bg-white p-3.5 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing hover:border-blue-200 transition-colors touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {isUrgent && (
        <div className="mb-1.5 text-xs font-medium text-red-500">⏰ Closing dalam 3 hari</div>
      )}
      <p className="text-sm font-medium text-gray-900 leading-tight">{app.job.title}</p>
      <p className="mt-0.5 text-xs text-gray-500">{app.job.company}</p>

      {app.matchScore !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Kecocokan</span>
            <span
              className={`font-medium ${
                app.matchScore >= 70
                  ? 'text-green-600'
                  : app.matchScore >= 50
                    ? 'text-yellow-600'
                    : 'text-red-500'
              }`}
            >
              {app.matchScore}%
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${
                app.matchScore >= 70
                  ? 'bg-green-500'
                  : app.matchScore >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-400'
              }`}
              style={{ width: `${app.matchScore}%` }}
            />
          </div>
        </div>
      )}

      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] ?? ''}`}
      >
        {APPLICATION_STATUS_LABELS[app.status] ?? app.status}
      </span>
    </div>
  )
}
