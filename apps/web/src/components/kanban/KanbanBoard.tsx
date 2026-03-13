'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

import toast from 'react-hot-toast'
import { APPLICATION_STATUS_LABELS } from '@jobflow/shared'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard, type ApplicationCard } from './KanbanCard'
import { ApplicationDetailModal } from './ApplicationDetailModal'

const KANBAN_COLUMNS = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected']

interface Props {
  initialApplications: ApplicationCard[]
}

export function KanbanBoard({ initialApplications }: Props) {
  const [applications, setApplications] = useState(initialApplications)
  const [activeApp, setActiveApp] = useState<ApplicationCard | null>(null)
  const [selectedApp, setSelectedApp] = useState<ApplicationCard | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())

  function toggleColumn(status: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const byStatus = KANBAN_COLUMNS.reduce<Record<string, ApplicationCard[]>>((acc, status) => {
    acc[status] = applications.filter((a) => a.status === status)
    return acc
  }, {})

  function onDragStart(event: DragStartEvent) {
    setActiveApp(event.active.data.current?.app ?? null)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveApp(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Determine target status: if dropped on a column, use that status;
    // if dropped on a card, use that card's status
    const targetStatus =
      KANBAN_COLUMNS.includes(overId)
        ? overId
        : applications.find((a) => a.id === overId)?.status

    if (!targetStatus) return

    const app = applications.find((a) => a.id === activeId)
    if (!app || app.status === targetStatus) return

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === activeId ? { ...a, status: targetStatus } : a))
    )

    const revert = () => {
      setApplications((prev) =>
        prev.map((a) => (a.id === activeId ? { ...a, status: app.status } : a))
      )
      toast.error(`Gagal memindahkan "${app.job?.title ?? 'lamaran'}"`)
    }

    const timeoutId = setTimeout(revert, 15_000)

    try {
      const res = await fetch(`/api/applications/${activeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error('Failed')
    } catch {
      clearTimeout(timeoutId)
      revert()
    }
  }

  const handleStatusChange = useCallback((appId: string, newStatus: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
    )
    setSelectedApp((prev) => (prev?.id === appId ? { ...prev, status: newStatus } : prev))
  }, [])

  const visibleColumns = KANBAN_COLUMNS.filter((s) => !hiddenColumns.has(s))

  return (
    <>
      {/* Column visibility toggles */}
      <div className="mb-4 flex flex-wrap gap-2">
        {KANBAN_COLUMNS.map((status) => {
          const hidden = hiddenColumns.has(status)
          return (
            <button
              key={status}
              onClick={() => toggleColumn(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                hidden
                  ? 'bg-gray-100 text-gray-400 line-through'
                  : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {APPLICATION_STATUS_LABELS[status] ?? status}
              {!hidden && (
                <span className="ml-1.5 text-gray-400">{byStatus[status]?.length ?? 0}</span>
              )}
            </button>
          )
        })}
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto">
          <div
            className="flex gap-4 pb-4"
            style={{ minWidth: `${visibleColumns.length * 280}px` }}
          >
            {visibleColumns.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                apps={byStatus[status] ?? []}
                onCardClick={setSelectedApp}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeApp ? (
            <div className="rotate-2 opacity-90">
              <KanbanCard app={activeApp} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedApp && (
        <ApplicationDetailModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  )
}
