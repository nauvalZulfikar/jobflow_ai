'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { APPLICATION_STATUS_LABELS } from '@jobflow/shared'
import { KanbanCard, type ApplicationCard } from './KanbanCard'

interface Props {
  status: string
  apps: ApplicationCard[]
  onCardClick: (app: ApplicationCard) => void
}

export function KanbanColumn({ status, apps, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="w-64 flex-none">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {APPLICATION_STATUS_LABELS[status] ?? status}
        </h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {apps.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[80px] rounded-xl space-y-2 p-2 transition-colors ${
          isOver ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-gray-50/60'
        }`}
      >
        <SortableContext items={apps.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {apps.map((app) => (
            <KanbanCard key={app.id} app={app} onClick={onCardClick} />
          ))}
        </SortableContext>

        {apps.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-400">
              {status === 'saved' && 'Simpan lowongan untuk mulai'}
              {status === 'applied' && 'Belum ada lamaran dikirim'}
              {status === 'screening' && 'Belum ada yang masuk screening'}
              {status === 'interview' && 'Belum ada jadwal interview'}
              {status === 'offer' && 'Belum ada penawaran'}
              {status === 'rejected' && 'Tidak ada penolakan'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
